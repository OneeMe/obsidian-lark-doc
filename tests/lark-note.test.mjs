import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadLarkNoteModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-lark-note-test-"));
	const outfile = join(tempDir, "lark-note.mjs");

	await esbuild.build({
		entryPoints: ["src/lark-note.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "obsidian-lark-doc-note-test-stub",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-lark-doc-note-test-stub",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-lark-doc-note-test-stub"}, () => ({
						loader: "js",
						contents: `
							export class TFile {}
							globalThis.__obsidianLarkNoteTestTFile = TFile;

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
		cleanup: () => process.env.NODE_V8_COVERAGE ? Promise.resolve() : rm(tempDir, {recursive: true, force: true}),
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
		assert.match(creates[0].content, /lark_doc_id: abc123/);
		assert.match(creates[0].content, /lark_url: https:\/\/www\.feishu\.cn\/wiki\/abc123/);
		assert.match(creates[0].content, /lark_title: Linked Doc/);
	} finally {
		await cleanup();
	}
});

test("createLarkMarkdownNote reads templates, reports missing templates, and sanitizes names", async () => {
	const {module, cleanup} = await loadLarkNoteModule();
	try {
		const TFile = globalThis.__obsidianLarkNoteTestTFile;
		const templateFile = new TFile();
		templateFile.path = "Templates/Lark Note.md";
		const missingTemplates = [];
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => {
					if (path === "Lark") return {path};
					if (path === "Templates/Lark Note.md") return templateFile;
					return null;
				},
				createFolder: async () => {
					throw new Error("folder already exists");
				},
				read: async (file) => {
					assert.equal(file, templateFile);
					return "Template body";
				},
				create: async (path, content) => {
					creates.push({path, content});
					return {path, extension: "md"};
				},
			},
		};

		await module.createLarkMarkdownNote(app, {
			folderPath: "Lark",
			templatePath: "Templates/Lark Note.md",
			title: "A/B:*?<>|",
			docId: "abc123",
			url: "https://www.feishu.cn/wiki/abc123",
			translate: (key) => `t:${key}`,
			onTemplateMissing: (path) => missingTemplates.push(path),
		});

		assert.equal(creates[0].path, "Lark/A B.lark.md");
		assert.match(creates[0].content, /t:shadow.title/);
		assert.match(creates[0].content, /Template body/);

		await module.createLarkMarkdownNote(app, {
			folderPath: "Lark",
			templatePath: "Templates/Missing.md",
			title: "Missing Template",
			docId: "def456",
			url: "https://www.feishu.cn/wiki/def456",
			onTemplateMissing: (path) => missingTemplates.push(path),
		});

		assert.deepEqual(missingTemplates, ["Templates/Missing.md"]);
	} finally {
		await cleanup();
	}
});
