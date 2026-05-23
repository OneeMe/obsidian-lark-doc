import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadTitleSyncModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-title-sync-test-"));
	const outfile = join(tempDir, "title-sync.mjs");

	await esbuild.build({
		entryPoints: ["src/title-sync.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "title-sync-test-stubs",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "title-sync-test-stubs",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "title-sync-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export class TFile {}

							export function normalizePath(path) {
								return path.replace(/\\/+/g, "/");
							}

							export function getFrontMatterInfo(content) {
								if (!content.startsWith("---\\n")) {
									return {exists: false, frontmatter: ""};
								}
								const end = content.indexOf("\\n---", 4);
								if (end < 0) {
									return {exists: false, frontmatter: ""};
								}
								return {exists: true, frontmatter: content.slice(4, end)};
							}

							export function parseYaml(yaml) {
								const result = {};
								for (const line of yaml.split("\\n")) {
									const index = line.indexOf(":");
									if (index < 0) continue;
									result[line.slice(0, index).trim()] = line.slice(index + 1).trim();
								}
								return result;
							}
						`,
					}));
					build.onResolve({filter: /lark-cli$/}, () => ({
						path: "lark-cli",
						namespace: "title-sync-test-stubs",
					}));
					build.onLoad({filter: /^lark-cli$/, namespace: "title-sync-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export async function fetchFeishuDocumentTitle() {
								if (globalThis.__obsidianFeishuTestTitleError) {
									throw globalThis.__obsidianFeishuTestTitleError;
								}
								return globalThis.__obsidianFeishuTestTitle;
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

test("syncTitle renames .lark.md notes to Feishu title with an indexed suffix on collision", async () => {
	const {module, cleanup} = await loadTitleSyncModule();
	const previousTitle = globalThis.__obsidianFeishuTestTitle;
	globalThis.__obsidianFeishuTestTitle = "Shared Title";

	try {
		const file = {
			extension: "md",
			path: "Feishu/Old Title.lark.md",
			parent: {path: "Feishu"},
		};
		const content = [
			"---",
			"lark_doc_id: abc123",
			"lark_url: https://www.feishu.cn/wiki/abc123",
			"lark_title: Shared Title",
			"---",
			"",
		].join("\n");
		const existingPaths = new Set([
			"Feishu/Shared Title.lark.md",
			"Feishu/Shared Title (1).lark.md",
		]);
		const renames = [];
		const app = {
			metadataCache: {
				getFileCache: () => null,
			},
			vault: {
				read: async () => content,
				cachedRead: async () => content,
				modify: async () => {
					throw new Error("front matter should not be modified when the title is already current");
				},
				getAbstractFileByPath: (path) => existingPaths.has(path) ? {path} : null,
				rename: async (targetFile, newPath) => {
					renames.push({from: targetFile.path, to: newPath});
					targetFile.path = newPath;
				},
			},
		};

		const changed = await module.syncTitle(app, file, {
			cliPath: "lark-cli",
			syncToFilename: false,
		});

		assert.equal(changed, true);
		assert.deepEqual(renames, [
			{
				from: "Feishu/Old Title.lark.md",
				to: "Feishu/Shared Title (2).lark.md",
			},
		]);
	} finally {
		globalThis.__obsidianFeishuTestTitle = previousTitle;
		await cleanup();
	}
});

test("syncTitle updates front matter, handles md filenames, and skips no-op states", async () => {
	const {module, cleanup} = await loadTitleSyncModule();
	const previousTitle = globalThis.__obsidianFeishuTestTitle;
	try {
		globalThis.__obsidianFeishuTestTitle = "New/Unsafe:Title";
		const file = {
			extension: "md",
			path: "Notes/Old.md",
			parent: {path: "Notes"},
		};
		const content = [
			"---",
			"lark_doc_id: abc123",
			"lark_url: https://www.feishu.cn/wiki/abc123",
			"---",
			"",
			"Body",
		].join("\n");
		const modifications = [];
		const renames = [];
		const app = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => content,
				cachedRead: async () => content,
				modify: async (_file, updated) => modifications.push(updated),
				getAbstractFileByPath: () => null,
				rename: async (targetFile, newPath) => {
					renames.push({from: targetFile.path, to: newPath});
					targetFile.path = newPath;
				},
			},
		};

		assert.equal(await module.syncTitle(app, file, {cliPath: "lark-cli", syncToFilename: true}), true);
		assert.match(modifications[0], /lark_title: "New\/Unsafe:Title"/);
		assert.deepEqual(renames, [{from: "Notes/Old.md", to: "Notes/New Unsafe Title.md"}]);

		globalThis.__obsidianFeishuTestTitle = "Replacement";
		const replaceApp = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => [
					"---",
					"lark_doc_id: abc123",
					"lark_title: Old",
					"---",
				].join("\n"),
				cachedRead: async () => [
					"---",
					"lark_doc_id: abc123",
					"lark_title: Old",
					"---",
				].join("\n"),
				modify: async (_file, updated) => modifications.push(updated),
				getAbstractFileByPath: (path) => path === "Notes/Replacement.md" ? file : null,
			},
		};
		assert.equal(await module.syncTitle(replaceApp, file, {cliPath: "lark-cli", syncToFilename: false}), true);
		assert.match(modifications[1], /lark_title: "Replacement"/);

		globalThis.__obsidianFeishuTestTitle = "???";
		const unsafeApp = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => [
					"---",
					"lark_doc_id: abc123",
					"lark_title: ???",
					"---",
				].join("\n"),
				cachedRead: async () => [
					"---",
					"lark_doc_id: abc123",
					"lark_title: ???",
					"---",
				].join("\n"),
				getAbstractFileByPath: () => null,
			},
		};
		assert.equal(await module.syncTitle(unsafeApp, file, {cliPath: "lark-cli", syncToFilename: true}), false);

		globalThis.__obsidianFeishuTestTitle = "Same";
		const sameFile = {
			extension: "md",
			path: "Lark/Same.lark.md",
			parent: {path: "Lark"},
		};
		const sameContent = [
			"---",
			"lark_doc_id: abc123",
			"lark_title: Same",
			"---",
		].join("\n");
		const sameApp = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => sameContent,
				cachedRead: async () => sameContent,
				getAbstractFileByPath: () => null,
			},
		};
		assert.equal(await module.syncTitle(sameApp, sameFile, {cliPath: "lark-cli", syncToFilename: false}), false);

		globalThis.__obsidianFeishuTestTitle = "Root";
		const rootFile = {
			extension: "md",
			path: "Old.md",
		};
		const rootRenames = [];
		const rootContent = [
			"---",
			"lark_doc_id: abc123",
			"lark_title: Old",
			"---",
		].join("\n");
		const rootApp = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => rootContent,
				cachedRead: async () => rootContent,
				modify: async () => {},
				getAbstractFileByPath: () => null,
				rename: async (targetFile, newPath) => {
					rootRenames.push({from: targetFile.path, to: newPath});
					targetFile.path = newPath;
				},
			},
		};
		assert.equal(await module.syncTitle(rootApp, rootFile, {cliPath: "lark-cli", syncToFilename: true}), true);
		assert.deepEqual(rootRenames, [{from: "Old.md", to: "Root.md"}]);

		globalThis.__obsidianFeishuTestTitle = "";
		assert.equal(await module.syncTitle(app, file, {cliPath: "lark-cli", syncToFilename: true}), false);

		const noFrontMatterApp = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => "No front matter",
				cachedRead: async () => "No front matter",
			},
		};
		assert.equal(await module.syncTitle(noFrontMatterApp, file, {cliPath: "lark-cli", syncToFilename: true}), false);
	} finally {
		globalThis.__obsidianFeishuTestTitle = previousTitle;
		await cleanup();
	}
});

test("syncTitle writes the title from file content even when metadata cache is stale", async () => {
	const {module, cleanup} = await loadTitleSyncModule();
	const previousTitle = globalThis.__obsidianFeishuTestTitle;
	try {
		globalThis.__obsidianFeishuTestTitle = "Remote: Synced Title";
		const file = {
			extension: "md",
			path: "Lark/Old Local.lark.md",
			parent: {path: "Lark"},
		};
		const content = [
			"---",
			"lark_doc_id: abc123",
			"lark_url: https://www.feishu.cn/wiki/abc123",
			"lark_title: Old Local",
			"---",
			"",
		].join("\n");
		const modifications = [];
		const renames = [];
		const app = {
			metadataCache: {
				getFileCache: () => ({
					frontmatter: {
						lark_doc_id: "abc123",
						lark_url: "https://www.feishu.cn/wiki/abc123",
						lark_title: "Remote: Synced Title",
					},
				}),
			},
			vault: {
				read: async () => content,
				cachedRead: async () => content,
				modify: async (_file, updated) => modifications.push(updated),
				getAbstractFileByPath: () => null,
				rename: async (targetFile, newPath) => {
					renames.push({from: targetFile.path, to: newPath});
					targetFile.path = newPath;
				},
			},
		};

		assert.equal(await module.syncTitle(app, file, {cliPath: "lark-cli", syncToFilename: true}), true);
		assert.match(modifications[0], /lark_title: "Remote: Synced Title"/);
		assert.deepEqual(renames, [{from: "Lark/Old Local.lark.md", to: "Lark/Remote  Synced Title.lark.md"}]);
	} finally {
		globalThis.__obsidianFeishuTestTitle = previousTitle;
		await cleanup();
	}
});

test("syncTitle returns false when the title fetch fails", async () => {
	const {module, cleanup} = await loadTitleSyncModule();
	const previousError = globalThis.__obsidianFeishuTestTitleError;
	const previousConsoleError = console.error;
	try {
		console.error = () => {};
		globalThis.__obsidianFeishuTestTitleError = new Error("network failed");
		const file = {
			extension: "md",
			path: "Lark/Old.lark.md",
			parent: {path: "Lark"},
		};
		const content = [
			"---",
			"lark_doc_id: abc123",
			"lark_title: Old",
			"---",
		].join("\n");
		const app = {
			metadataCache: {getFileCache: () => null},
			vault: {
				read: async () => content,
				cachedRead: async () => content,
			},
		};

		assert.equal(await module.syncTitle(app, file, {cliPath: "lark-cli", syncToFilename: true}), false);
	} finally {
		globalThis.__obsidianFeishuTestTitleError = previousError;
		console.error = previousConsoleError;
		await cleanup();
	}
});
