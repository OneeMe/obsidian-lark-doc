import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadBaseManagerModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-base-manager-test-"));
	const outfile = join(tempDir, "base-manager.mjs");

	await esbuild.build({
		entryPoints: ["src/base-manager.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
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
		cleanup: () => process.env.NODE_V8_COVERAGE ? Promise.resolve() : rm(tempDir, {recursive: true, force: true}),
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
		assert.match(writes[0].content, /lark_doc_id/);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile updates existing TFile bases and skips unchanged content", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const TFile = globalThis.__obsidianFeishuBaseTestTFile;
		const file = new TFile();
		file.path = "Lark/Lark Documents.base";
		const modifies = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => path === file.path ? file : null,
				read: async () => "filters: 'old_filter'\n",
				modify: async (_file, content) => {
					modifies.push(content);
				},
			},
		};

		await module.ensureBaseFile(app, "Lark");
		assert.equal(modifies.length, 1);
		assert.match(modifies[0], /Lark Title/);

		app.vault.read = async () => "filters: 'lark_doc_id'\n";
		await module.ensureBaseFile(app, "Lark");
		assert.equal(modifies.length, 1);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile falls back when modifying an existing TFile is rejected", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const TFile = globalThis.__obsidianFeishuBaseTestTFile;
		const file = new TFile();
		file.path = "Lark/Lark Documents.base";
		const writes = [];
		const app = {
			vault: {
				getAbstractFileByPath: (path) => path === file.path ? file : null,
				read: async () => "filters: 'old_filter'\n",
				modify: async () => {
					throw new Error("vault modify rejected .base");
				},
				adapter: {
					write: async (path, content) => {
						writes.push({path, content});
					},
				},
			},
		};

		await module.ensureBaseFile(app, "Lark");
		assert.equal(writes.length, 1);
		assert.equal(writes[0].path, "Lark/Lark Documents.base");
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile handles already-created base files and root base paths", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const creates = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {
					throw new Error("createFolder should not run for root path");
				},
				create: async (path) => {
					creates.push(path);
					throw new Error("already exists");
				},
				adapter: {
					exists: async () => false,
				},
			},
		};

		await module.ensureBaseFile(app, " ");
		assert.deepEqual(creates, ["Lark Documents.base"]);

		const rootCreates = [];
		const rootApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {
					throw new Error("createFolder should not run for an empty folder");
				},
				create: async (path) => {
					rootCreates.push(path);
				},
				adapter: {
					exists: async () => false,
				},
			},
		};
		await module.ensureBaseFile(rootApp, "");
		assert.deepEqual(rootCreates, ["Lark Documents.base"]);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile falls back to adapter mkdir for nested folders", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const folders = [];
		const mkdirs = [];
		const app = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async (path) => {
					folders.push(path);
					throw new Error("vault folder rejected");
				},
				create: async () => {},
				adapter: {
					exists: async (path) => path === "Team",
					mkdir: async (path) => {
						mkdirs.push(path);
					},
				},
			},
		};

		await module.ensureBaseFile(app, "Team/Lark");
		assert.deepEqual(folders, ["Team/Lark"]);
		assert.deepEqual(mkdirs, ["Team/Lark"]);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile surfaces adapter fallback failures with combined errors", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		const folderApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {
					throw "vault folder failed";
				},
				create: async () => {},
				adapter: {
					exists: async () => false,
					mkdir: async () => {
						throw new Error("adapter folder failed");
					},
				},
			},
		};

		await assert.rejects(
			() => module.ensureBaseFile(folderApp, "Broken"),
			/Failed to create folder Broken\. Vault error: vault folder failed\. Adapter error: adapter folder failed/
		);

		const writeApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {},
				create: async () => {
					throw new Error("vault create failed");
				},
				adapter: {
					exists: async () => false,
					write: async () => {
						throw "adapter write failed";
					},
				},
			},
		};

		await assert.rejects(
			() => module.ensureBaseFile(writeApp, "Broken"),
			/Failed to write base file\. Vault error: vault create failed\. Adapter error: adapter write failed/
		);
	} finally {
		await cleanup();
	}
});

test("ensureBaseFile tolerates adapter fallback races when paths appear concurrently", async () => {
	const {module, cleanup} = await loadBaseManagerModule();
	try {
		let folderExistsChecks = 0;
		const folderApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {
					throw new Error("vault folder rejected");
				},
				create: async () => {},
				adapter: {
					exists: async (path) => {
						if (path !== "Race") return false;
						folderExistsChecks++;
						return folderExistsChecks > 2;
					},
					mkdir: async () => {
						throw new Error("adapter folder rejected");
					},
				},
			},
		};
		await module.ensureBaseFile(folderApp, "Race");

		let baseExistsChecks = 0;
		const writeApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {},
				create: async () => {
					throw new Error("vault create rejected");
				},
				adapter: {
					exists: async (path) => {
						if (path !== "Race/Lark Documents.base") return false;
						baseExistsChecks++;
						return baseExistsChecks > 2;
					},
					write: async () => {
						throw new Error("adapter write rejected");
					},
				},
			},
		};
		await module.ensureBaseFile(writeApp, "Race");

		const alreadyExistsApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {
					throw new Error("vault folder rejected");
				},
				create: async () => {},
				adapter: {
					exists: async () => false,
					mkdir: async () => {
						throw new Error("already exists");
					},
				},
			},
		};
		await module.ensureBaseFile(alreadyExistsApp, "Already");

		const vaultRaceApp = {
			vault: {
				getAbstractFileByPath: () => null,
				createFolder: async () => {
					throw new Error("already exists");
				},
				create: async () => {},
				adapter: {
					exists: async () => false,
				},
			},
		};
		await module.ensureBaseFile(vaultRaceApp, "VaultRace");
	} finally {
		await cleanup();
	}
});
