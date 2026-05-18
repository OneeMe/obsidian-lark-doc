import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadTitleSyncModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-title-sync-test-"));
	const outfile = join(tempDir, "title-sync.mjs");

	await esbuild.build({
		entryPoints: ["src/title-sync.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
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
		cleanup: () => rm(tempDir, {recursive: true, force: true}),
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
			"feishu_doc_id: abc123",
			"feishu_url: https://www.feishu.cn/wiki/abc123",
			"feishu_title: Shared Title",
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
