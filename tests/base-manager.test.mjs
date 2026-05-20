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

test("ensureBaseFile creates Lark Documents.base in the default note folder", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async (path) => {
					assert.equal(path, "Lark");
				},
				create: async (path) => {
					creates.push(path);
				},
			},
		};

		await module.ensureBaseFile(app, "Lark");

		assert.deepEqual(creates, ["Lark/Lark Documents.base"]);
		assert.equal(module.getBaseFilePath("Lark"), "Lark/Lark Documents.base");
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile creates a new Lark base without migrating legacy Feishu base files", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const TFile = globalThis.__obsidianFeishuBaseTestTFile;
		const legacyBase = new TFile();
		legacyBase.path = "Feishu Documents.base";
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => {
					if (path === "Feishu Documents.base") return legacyBase;
					return null;
				},
				createFolder: async (path) => {
					assert.equal(path, "Lark");
				},
				create: async (path) => {
					creates.push(path);
				},
			},
		};

		await module.ensureBaseFile(app, "Lark");

		assert.deepEqual(creates, ["Lark/Lark Documents.base"]);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile updates existing Lark base content through the adapter", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const writes = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => {
					if (path === "lark") return {};
					return null;
				},
				createFolder: async () => {
					throw new Error("createFolder should not run");
				},
				adapter: {
					exists: async (path) => path === "lark" || path === "lark/Lark Documents.base",
					read: async () => "filters: 'old_filter'\n",
					write: async (path, content) => {
						writes.push({path, content});
					},
				},
			},
		};

		await module.ensureBaseFile(app, "lark");

		assert.equal(writes.length, 1);
		assert.equal(writes[0].path, "lark/Lark Documents.base");
		assert.match(writes[0].content, /Lark Title/);
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
		assert.equal(writes[0].path, "lark/Lark Documents.base");
		assert.match(writes[0].content, /feishu_doc_id/);
	} finally {
		await cleanup();
	}
});
