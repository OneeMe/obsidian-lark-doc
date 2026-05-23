import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadLarkCliModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-lark-cli-test-"));
	const outfile = join(tempDir, "lark-cli.mjs");

	await esbuild.build({
		entryPoints: ["src/lark-cli.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "lark-cli-test-stubs",
				setup(build) {
					build.onResolve({filter: /^child_process$/}, () => ({
						path: "child_process",
						namespace: "lark-cli-test-stubs",
					}));
					build.onResolve({filter: /lark-cli-resolver$/}, () => ({
						path: "lark-cli-resolver",
						namespace: "lark-cli-test-stubs",
					}));
					build.onLoad({filter: /^child_process$/, namespace: "lark-cli-test-stubs"}, () => ({
						loader: "js",
						contents: `
							import {EventEmitter} from "node:events";

							export function spawn(cliPath, args, options) {
								const call = globalThis.__larkCliSpawnQueue.shift();
								if (!call) throw new Error("Unexpected spawn call");
								globalThis.__larkCliSpawnCalls.push({cliPath, args, options});

								const proc = new EventEmitter();
								proc.stdout = new EventEmitter();
								proc.stderr = new EventEmitter();

								queueMicrotask(() => {
									if (call.error) {
										proc.emit("error", call.error);
										return;
									}
									if (call.stdout !== undefined) proc.stdout.emit("data", call.stdout);
									if (call.stderr !== undefined) proc.stderr.emit("data", call.stderr);
									proc.emit("close", call.code ?? 0);
								});

								return proc;
							}
						`,
					}));
					build.onLoad({filter: /^lark-cli-resolver$/, namespace: "lark-cli-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function getEffectiveLarkCliPath(cliPath) {
								return globalThis.__larkCliEffectivePath ?? cliPath;
							}
						`,
					}));
				},
			},
		],
	});

	const imported = await import(pathToFileURL(outfile).href);
	return {
		module: imported,
		cleanup: () => process.env.NODE_V8_COVERAGE ? Promise.resolve() : rm(tempDir, {recursive: true, force: true}),
	};
}

function resetLarkCliStubs() {
	globalThis.__larkCliSpawnQueue = [];
	globalThis.__larkCliSpawnCalls = [];
	globalThis.__larkCliEffectivePath = "/resolved/lark-cli";
}

test("createFeishuDocument parses successful CLI responses and fallbacks", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	try {
		resetLarkCliStubs();
		globalThis.__larkCliSpawnQueue.push({
			stdout: JSON.stringify({
				data: {
					node_token: "wikabc",
					title: "Created Title",
					url: "https://tenant.feishu.cn/wiki/wikabc",
				},
			}),
		});
		assert.deepEqual(
			await module.createFeishuDocument("lark-cli", "Input Title", "tenant.feishu.cn"),
			{
				docId: "wikabc",
				url: "https://tenant.feishu.cn/wiki/wikabc",
				title: "Created Title",
			}
		);
		assert.deepEqual(globalThis.__larkCliSpawnCalls[0].args, [
			"wiki", "+node-create",
			"--as", "user",
			"--title", "Input Title",
		]);
		assert.equal(globalThis.__larkCliSpawnCalls[0].cliPath, "/resolved/lark-cli");
		assert.equal(globalThis.__larkCliSpawnCalls[0].options.shell, false);
		assert.ok(globalThis.__larkCliSpawnCalls[0].options.env.PATH.startsWith("/resolved:"));

		globalThis.__larkCliEffectivePath = "lark-cli";
		globalThis.__larkCliSpawnQueue.push({
			stdout: JSON.stringify({node_token: "wikfallback"}),
		});
		assert.deepEqual(
			await module.createFeishuDocument("lark-cli", "Fallback Title", "tenant.feishu.cn"),
			{
				docId: "wikfallback",
				url: "https://tenant.feishu.cn/wiki/wikfallback",
				title: "Fallback Title",
			}
		);
		assert.deepEqual(globalThis.__larkCliSpawnCalls[1].options, {shell: false});
	} finally {
		await cleanup();
	}
});

test("createFeishuDocument prepends the resolved CLI directory to PATH", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	const previousPath = process.env.PATH;
	try {
		process.env.PATH = "/usr/bin:/bin";
		resetLarkCliStubs();
		globalThis.__larkCliEffectivePath = "/Users/test/.local/state/fnm/bin/lark-cli";
		globalThis.__larkCliSpawnQueue.push({
			stdout: JSON.stringify({node_token: "wikpath"}),
		});

		await module.createFeishuDocument("lark-cli", "Path Title", "tenant.feishu.cn");

		assert.equal(globalThis.__larkCliSpawnCalls[0].options.shell, false);
		assert.equal(
			globalThis.__larkCliSpawnCalls[0].options.env.PATH,
			"/Users/test/.local/state/fnm/bin:/usr/bin:/bin"
		);

		delete process.env.PATH;
		globalThis.__larkCliSpawnQueue.push({
			stdout: JSON.stringify({node_token: "wikpath2"}),
		});
		await module.createFeishuDocument("lark-cli", "Path Title 2", "tenant.feishu.cn");
		assert.equal(
			globalThis.__larkCliSpawnCalls[1].options.env.PATH,
			"/Users/test/.local/state/fnm/bin"
		);
	} finally {
		if (previousPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = previousPath;
		}
		await cleanup();
	}
});

test("createFeishuDocument reports parse, API, spawn, and token errors", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	try {
		resetLarkCliStubs();
		globalThis.__larkCliSpawnQueue.push({stdout: "not json"});
		await assert.rejects(
			() => module.createFeishuDocument("lark-cli", "Title", "tenant.feishu.cn"),
			/Could not parse Lark CLI output/
		);

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {message: "denied"}})});
		await assert.rejects(
			() => module.createFeishuDocument("lark-cli", "Title", "tenant.feishu.cn"),
			/denied/
		);

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {code: 1}})});
		await assert.rejects(
			() => module.createFeishuDocument("lark-cli", "Title", "tenant.feishu.cn"),
			/"code":1/
		);

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({title: "No Token"})});
		await assert.rejects(
			() => module.createFeishuDocument("lark-cli", "Title", "tenant.feishu.cn"),
			/Failed to extract node_token/
		);

		globalThis.__larkCliSpawnQueue.push({error: new Error("ENOENT")});
		await assert.rejects(
			() => module.createFeishuDocument("lark-cli", "Title", "tenant.feishu.cn"),
			(err) => err instanceof module.LarkCliError && err.name === "LarkCliError" && /Failed to spawn/.test(err.message)
		);
	} finally {
		await cleanup();
	}
});

test("createFeishuDocument explains how to fix missing Lark CLI errors", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	try {
		resetLarkCliStubs();
		globalThis.__larkCliEffectivePath = "lark-cli";
		globalThis.__larkCliSpawnQueue.push({
			error: Object.assign(new Error("spawn lark-cli ENOENT"), {
				code: "ENOENT",
				path: "lark-cli",
				syscall: "spawn lark-cli",
			}),
		});

		await assert.rejects(
			() => module.createFeishuDocument("lark-cli", "Title", "tenant.feishu.cn"),
			(err) => {
				assert.ok(err instanceof module.LarkCliError);
				assert.match(err.message, /Lark CLI was not found/);
				assert.match(err.message, /absolute path/);
				assert.match(err.message, /Obsidian may not inherit your terminal PATH/);
				assert.match(err.message, /Current value: lark-cli/);
				assert.doesNotMatch(err.message, /spawn lark-cli ENOENT/);
				assert.equal(err.translationKey, "error.larkCliNotFound");
				assert.deepEqual(err.translationVars, {cliPath: "lark-cli"});
				return true;
			}
		);
	} finally {
		await cleanup();
	}
});

test("formatLarkCliError translates structured errors and preserves fallback messages", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	try {
		const translated = module.formatLarkCliError(
			Object.assign(new Error("English fallback"), {
				translationKey: "error.larkCliNotFound",
				translationVars: {cliPath: "lark-cli"},
			}),
			(key, vars) => `${key}:${vars.cliPath}`
		);
		assert.equal(translated, "error.larkCliNotFound:lark-cli");
		assert.equal(
			module.formatLarkCliError(new Error("plain failure"), () => "unused"),
			"plain failure"
		);
		assert.equal(
			module.formatLarkCliError("raw failure", () => "unused"),
			"raw failure"
		);
	} finally {
		await cleanup();
	}
});

test("fetchFeishuDocumentTitle uses wiki lookup, docs JSON, XML, and empty fallback", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	try {
		resetLarkCliStubs();
		globalThis.__larkCliSpawnQueue.push({
			stdout: JSON.stringify({data: {node: {title: "Wiki Title"}}}),
		});
		assert.equal(await module.fetchFeishuDocumentTitle("lark-cli", "wikabc"), "Wiki Title");

		globalThis.__larkCliSpawnQueue.push({code: 1, stderr: "wiki failed"});
		globalThis.__larkCliSpawnQueue.push({stdout: "noise\n{\"document\":{\"title\":\"Doc JSON Title\"}}\n"});
		assert.equal(await module.fetchFeishuDocumentTitle("lark-cli", "docabc"), "Doc JSON Title");

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {message: "not wiki"}})});
		globalThis.__larkCliSpawnQueue.push({stdout: "<doc><title>XML Title</title></doc>"});
		assert.equal(await module.fetchFeishuDocumentTitle("lark-cli", "docxml"), "XML Title");

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({title: ""})});
		globalThis.__larkCliSpawnQueue.push({stdout: "plain text"});
		assert.equal(await module.fetchFeishuDocumentTitle("lark-cli", "empty"), "");
	} finally {
		await cleanup();
	}
});

test("fetchFeishuDocumentTitle reports docs fallback failures", async () => {
	const {module, cleanup} = await loadLarkCliModule();
	try {
		resetLarkCliStubs();
		globalThis.__larkCliSpawnQueue.push({stdout: "{not valid json"});
		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {message: "docs denied"}})});
		await assert.rejects(
			() => module.fetchFeishuDocumentTitle("lark-cli", "docabc"),
			/docs denied/
		);

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {message: "wiki denied"}})});
		globalThis.__larkCliSpawnQueue.push({code: 2, stderr: ""});
		await assert.rejects(
			() => module.fetchFeishuDocumentTitle("lark-cli", "docabc"),
			/Lark CLI exited with code 2/
		);

		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {message: "wiki ignored"}})});
		globalThis.__larkCliSpawnQueue.push({stdout: JSON.stringify({error: {code: 403}})});
		await assert.rejects(
			() => module.fetchFeishuDocumentTitle("lark-cli", "docabc"),
			/"code":403/
		);
	} finally {
		delete globalThis.__larkCliSpawnQueue;
		delete globalThis.__larkCliSpawnCalls;
		delete globalThis.__larkCliEffectivePath;
		await cleanup();
	}
});
