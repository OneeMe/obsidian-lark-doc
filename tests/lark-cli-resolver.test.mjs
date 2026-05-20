import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadResolverModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-lark-cli-resolver-test-"));
	const outfile = join(tempDir, "lark-cli-resolver.mjs");

	await esbuild.build({
		entryPoints: ["src/lark-cli-resolver.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "lark-cli-resolver-test-stubs",
				setup(build) {
					for (const moduleName of ["child_process", "fs", "os"]) {
						build.onResolve({filter: new RegExp(`^${moduleName}$`)}, () => ({
							path: moduleName,
							namespace: "lark-cli-resolver-test-stubs",
						}));
					}
					build.onLoad({filter: /^child_process$/, namespace: "lark-cli-resolver-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function execSync(command, options) {
								return globalThis.__resolverExecSync(command, options);
							}
						`,
					}));
					build.onLoad({filter: /^fs$/, namespace: "lark-cli-resolver-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function existsSync(path) {
								return globalThis.__resolverExistsSync(path);
							}
						`,
					}));
					build.onLoad({filter: /^os$/, namespace: "lark-cli-resolver-test-stubs"}, () => ({
						loader: "js",
						contents: "export function homedir() { return '/home/tester'; }",
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

function resetResolverStubs() {
	globalThis.__resolverExistsSync = () => false;
	globalThis.__resolverExecSync = () => {
		throw new Error("not found");
	};
}

test("resolveLarkCliPath checks common paths, npm locations, and which fallback", async () => {
	const {module, cleanup} = await loadResolverModule();
	try {
		resetResolverStubs();
		globalThis.__resolverExistsSync = (path) => path === "/home/tester/.local/bin/lark-cli";
		assert.equal(module.resolveLarkCliPath(), "/home/tester/.local/bin/lark-cli");

		resetResolverStubs();
		globalThis.__resolverExecSync = (command) => {
			assert.equal(command, "npm prefix -g");
			return "/opt/npm\n";
		};
		globalThis.__resolverExistsSync = (path) => path === "/opt/npm/bin/lark-cli";
		assert.equal(module.resolveLarkCliPath(), "/opt/npm/bin/lark-cli");

		resetResolverStubs();
		globalThis.__resolverExecSync = (command) => {
			assert.equal(command, "npm prefix -g");
			return "/opt/npm\n";
		};
		globalThis.__resolverExistsSync = (path) => path === "/opt/npm/lib/node_modules/@larksuite/cli/bin/lark-cli";
		assert.equal(
			module.resolveLarkCliPath(),
			"/opt/npm/lib/node_modules/@larksuite/cli/bin/lark-cli"
		);

		resetResolverStubs();
		globalThis.__resolverExecSync = (command) => {
			if (command === "npm prefix -g") throw new Error("npm missing");
			assert.equal(command, "command -v lark-cli || which lark-cli");
			return "/custom/bin/lark-cli\n";
		};
		globalThis.__resolverExistsSync = (path) => path === "/custom/bin/lark-cli";
		assert.equal(module.resolveLarkCliPath(), "/custom/bin/lark-cli");

		resetResolverStubs();
		assert.equal(module.resolveLarkCliPath(), undefined);
	} finally {
		await cleanup();
	}
});

test("resolveUserShellPath falls back from login shell to non-login shell", async () => {
	const {module, cleanup} = await loadResolverModule();
	const previousShell = process.env.SHELL;
	try {
		process.env.SHELL = "/bin/test-shell";
		resetResolverStubs();
		globalThis.__resolverExecSync = (command, options) => {
			assert.deepEqual(options, {encoding: "utf8", timeout: 10000});
			assert.equal(command, "/bin/test-shell -l -c 'echo \"$PATH\"'");
			return "/login/bin\n";
		};
		assert.equal(module.resolveUserShellPath(), "/login/bin");

		globalThis.__resolverExecSync = (command, options) => {
			if (command.includes(" -l ")) throw new Error("login failed");
			assert.deepEqual(options, {encoding: "utf8", timeout: 5000});
			assert.equal(command, "/bin/test-shell -c 'echo \"$PATH\"'");
			return "/fallback/bin\n";
		};
		assert.equal(module.resolveUserShellPath(), "/fallback/bin");

		globalThis.__resolverExecSync = (command) => {
			if (command.includes(" -l ")) throw new Error("login failed");
			return "\n";
		};
		assert.equal(module.resolveUserShellPath(), undefined);

		globalThis.__resolverExecSync = () => {
			throw new Error("shell failed");
		};
		assert.equal(module.resolveUserShellPath(), undefined);

		delete process.env.SHELL;
		globalThis.__resolverExecSync = (command) => {
			assert.equal(command, "/bin/zsh -l -c 'echo \"$PATH\"'");
			return "\n";
		};
		assert.equal(module.resolveUserShellPath(), undefined);
	} finally {
		if (previousShell === undefined) {
			delete process.env.SHELL;
		} else {
			process.env.SHELL = previousShell;
		}
		await cleanup();
	}
});

test("getEffectiveLarkCliPath trusts explicit settings and falls back to detection", async () => {
	const {module, cleanup} = await loadResolverModule();
	try {
		resetResolverStubs();
		assert.equal(module.getEffectiveLarkCliPath("/custom/lark-cli"), "/custom/lark-cli");

		globalThis.__resolverExistsSync = (path) => path === "/usr/local/bin/lark-cli";
		assert.equal(module.getEffectiveLarkCliPath("lark-cli"), "/usr/local/bin/lark-cli");

		resetResolverStubs();
		assert.equal(module.getEffectiveLarkCliPath("lark-cli"), "lark-cli");
		assert.equal(module.getEffectiveLarkCliPath(""), "lark-cli");
	} finally {
		delete globalThis.__resolverExistsSync;
		delete globalThis.__resolverExecSync;
		await cleanup();
	}
});
