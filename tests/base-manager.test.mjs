import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadBaseManagerModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-base-manager-test-"));
	const outfile = join(tempDir, "base-manager.mjs");

	await esbuild.build({
		entryPoints: ["src/base-manager.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		plugins: [
			{
				name: "obsidian-base-manager-test-stub",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-base-manager-test-stub",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-base-manager-test-stub"}, () => ({
						loader: "js",
						contents: `
							export class TFile {}
							globalThis.__obsidianFeishuBaseTestTFile = TFile;

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

test("ensureBaseFile creates Feishu Documents.base in the default note folder", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async (path) => {
					assert.equal(path, "Feishu");
				},
				create: async (path) => {
					creates.push(path);
				},
			},
		};

		await module.ensureBaseFile(app, "Feishu");

		assert.deepEqual(creates, ["Feishu/Feishu Documents.base"]);
		assert.equal(module.getBaseFilePath("Feishu"), "Feishu/Feishu Documents.base");
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile migrates a legacy root base file into the default note folder", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const TFile = globalThis.__obsidianFeishuBaseTestTFile;
		const legacyBase = new TFile();
		legacyBase.path = "Feishu Documents.base";
		const renames = [];
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => {
					if (path === "Feishu Documents.base") return legacyBase;
					return null;
				},
				createFolder: async (path) => {
					assert.equal(path, "Feishu");
				},
				create: async (path) => {
					creates.push(path);
				},
				rename: async (file, path) => {
					renames.push({from: file.path, to: path});
					file.path = path;
				},
			},
		};

		await module.ensureBaseFile(app, "Feishu");

		assert.deepEqual(creates, []);
		assert.deepEqual(renames, [
			{
				from: "Feishu Documents.base",
				to: "Feishu/Feishu Documents.base",
			},
		]);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile falls back to adapter rename when vault rename rejects the base file", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const TFile = globalThis.__obsidianFeishuBaseTestTFile;
		const legacyBase = new TFile();
		legacyBase.path = "Feishu Documents.base";
		const adapterRenames = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => {
					if (path === "Feishu Documents.base") return legacyBase;
					if (path === "lark") return {};
					return null;
				},
				createFolder: async () => {
					throw new Error("createFolder should not run");
				},
				rename: async () => {
					throw new Error("vault rename rejected .base");
				},
				adapter: {
					exists: async (path) => path === "Feishu Documents.base" || path === "lark",
					rename: async (from, to) => {
						adapterRenames.push({from, to});
					},
				},
			},
		};

		await module.ensureBaseFile(app, "lark");

		assert.deepEqual(adapterRenames, [
			{
				from: "Feishu Documents.base",
				to: "lark/Feishu Documents.base",
			},
		]);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile falls back to adapter write when vault create rejects the base file", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const writes = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async (path) => {
					assert.equal(path, "lark");
				},
				create: async () => {
					throw new Error("vault create rejected .base");
				},
				adapter: {
					exists: async (path) => path === "lark",
					write: async (path, content) => {
						writes.push({path, content});
					},
				},
			},
		};

		await module.ensureBaseFile(app, "lark");

		assert.equal(writes.length, 1);
		assert.equal(writes[0].path, "lark/Feishu Documents.base");
		assert.match(writes[0].content, /feishu_doc_id/);
	} finally {
		await cleanup();
	}
});
