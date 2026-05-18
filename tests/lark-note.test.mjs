import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadLarkNoteModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-lark-note-test-"));
	const outfile = join(tempDir, "lark-note.mjs");

	await esbuild.build({
		entryPoints: ["src/lark-note.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		plugins: [
			{
				name: "obsidian-lark-note-test-stub",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-lark-note-test-stub",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-lark-note-test-stub"}, () => ({
						loader: "js",
						contents: `
							export class TFile {}

							export function normalizePath(path) {
								return path.replace(/\\/+/g, "/");
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

test("createLarkMarkdownNote creates a linked .lark.md file in the default note folder", async () => {
	const {module, cleanup} = await loadLarkNoteModule();
	try {
		const existingPaths = new Set(["Feishu/Linked Doc.lark.md"]);
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => existingPaths.has(path) ? {path} : null,
				createFolder: async (path) => {
					assert.equal(path, "Feishu");
				},
				create: async (path, content) => {
					creates.push({path, content});
					return {path, extension: "md"};
				},
			},
		};

		const file = await module.createLarkMarkdownNote(app, {
			folderPath: "Feishu",
			title: "Linked Doc",
			docId: "abc123",
			url: "https://www.feishu.cn/wiki/abc123",
		});

		assert.equal(file.path, "Feishu/Linked Doc (1).lark.md");
		assert.equal(creates.length, 1);
		assert.equal(creates[0].path, "Feishu/Linked Doc (1).lark.md");
		assert.match(creates[0].content, /feishu_doc_id: abc123/);
		assert.match(creates[0].content, /feishu_url: https:\/\/www\.feishu\.cn\/wiki\/abc123/);
		assert.match(creates[0].content, /feishu_title: Linked Doc/);
	} finally {
		await cleanup();
	}
});
