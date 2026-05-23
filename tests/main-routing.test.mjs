import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadMainRoutingModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-lark-doc-main-routing-test-"));
	const outfile = join(tempDir, "main.mjs");

	await esbuild.build({
		entryPoints: ["src/main.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "obsidian-main-routing-test-stubs",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-main-routing-test-stubs",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: `
							globalThis.__obsidianLarkRoutingOriginalCalls = [];

							export class Modal {}
							export class Notice {}
							export class TFile {}

							export class Plugin {
								register(cleanup) {
									this.cleanup = cleanup;
								}
							}

							export class WorkspaceLeaf {
								constructor(state = {type: "empty"}) {
									this.state = state;
									this.detached = false;
									this.loaded = false;
								}
								getViewState() {
									return this.state;
								}
								async setViewState(viewState, eState) {
									globalThis.__obsidianLarkRoutingOriginalCalls.push({
										leaf: this,
										viewState,
										eState,
									});
									this.state = viewState;
								}
								detach() {
									this.detached = true;
								}
								async loadIfDeferred() {
									this.loaded = true;
								}
							}

							globalThis.__obsidianLarkRoutingWorkspaceLeaf = WorkspaceLeaf;
						`,
					}));

					for (const moduleName of [
						"feishu-view",
						"indexer",
						"settings",
						"types",
						"doc-creator",
						"title-sync",
						"base-manager",
						"feishu-frontmatter",
						"lark-file",
						"lark-note",
						"lark-cli",
						"i18n",
					]) {
						build.onResolve({filter: new RegExp(`${moduleName}$`)}, () => ({
							path: moduleName,
							namespace: "obsidian-main-routing-test-stubs",
						}));
					}

					build.onLoad({filter: /^feishu-view$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export class FeishuDocView {}
							export const FEISHU_VIEW_TYPE = "feishu-doc-view";
							export async function openFeishuView() {}
							export function findFeishuLeafForSourcePath(leaves, sourcePath) {
								return leaves.find((leaf) => {
									const state = leaf.getViewState().state;
									return state?.sourcePath === sourcePath || state?.file === sourcePath;
								});
							}
						`,
					}));
					build.onLoad({filter: /^indexer$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export class FeishuIndexer {}",
					}));
					build.onLoad({filter: /^settings$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export const DEFAULT_SETTINGS = {language: "en"};
							export class FeishuSettingTab {}
						`,
					}));
					build.onLoad({filter: /^types$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export function parseFeishuUrl() { return null; }",
					}));
					build.onLoad({filter: /^doc-creator$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export class CreateFeishuDocModal {}",
					}));
					build.onLoad({filter: /^title-sync$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function syncTitle() { return false; }",
					}));
					build.onLoad({filter: /^base-manager$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export async function ensureBaseFile() {}
							export function getBaseFilePath() { return "Lark Documents.base"; }
						`,
					}));
					build.onLoad({filter: /^feishu-frontmatter$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function readFeishuFrontMatter() { return null; }",
					}));
					build.onLoad({filter: /^lark-file$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function getLarkMarkdownPathFromViewState(viewState) {
								const file = viewState.type === "markdown" ? viewState.state?.file : undefined;
								return typeof file === "string" && file.endsWith(".lark.md") ? file : undefined;
							}
							export function isLarkMarkdownFile() { return false; }
						`,
					}));
					build.onLoad({filter: /^lark-note$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function createLarkMarkdownNote() {}",
					}));
					build.onLoad({filter: /^lark-cli$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function fetchFeishuDocumentTitle() { return null; }",
					}));
					build.onLoad({filter: /^i18n$/, namespace: "obsidian-main-routing-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function translate(_language, key) { return key; }
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

test("lark markdown routing reveals the existing Feishu leaf instead of opening a duplicate", async () => {
	const {module, cleanup} = await loadMainRoutingModule();
	try {
		const Leaf = globalThis.__obsidianLarkRoutingWorkspaceLeaf;
		const existingLeaf = new Leaf({
			type: "feishu-doc-view",
			state: {
				file: "Feishu/Doc.lark.md",
				sourcePath: "Feishu/Doc.lark.md",
			},
		});
		const targetLeaf = new Leaf({type: "empty"});
		const revealedLeaves = [];
		const plugin = new module.default();
		plugin.app = {
			workspace: {
				getLeavesOfType: (type) => type === "feishu-doc-view" ? [existingLeaf] : [],
				revealLeaf: async (leaf) => {
					revealedLeaves.push(leaf);
				},
			},
		};
		plugin.indexer = {
			getEntryByPath: async (path) => ({
				path,
				feishu_url: "https://www.feishu.cn/wiki/docabc",
				feishu_title: "Doc",
			}),
		};
		plugin.settings = {
			frameZoom: 1,
			frameCustomCss: "",
			hideFeishuHeader: true,
		};

		plugin.registerLarkMarkdownRouting();
		await targetLeaf.setViewState({
			type: "markdown",
			state: {file: "Feishu/Doc.lark.md"},
		});

		assert.deepEqual(revealedLeaves, [existingLeaf]);
		assert.equal(existingLeaf.loaded, true);
		assert.equal(targetLeaf.detached, true);
		assert.equal(globalThis.__obsidianLarkRoutingOriginalCalls.length, 1);
		assert.equal(globalThis.__obsidianLarkRoutingOriginalCalls[0].leaf, existingLeaf);
		assert.equal(
			globalThis.__obsidianLarkRoutingOriginalCalls[0].viewState.state.url,
			"https://www.feishu.cn/wiki/docabc"
		);
	} finally {
		await cleanup();
	}
});

test("lark markdown routing converts the first open into a Feishu view state", async () => {
	const {module, cleanup} = await loadMainRoutingModule();
	try {
		const Leaf = globalThis.__obsidianLarkRoutingWorkspaceLeaf;
		const targetLeaf = new Leaf({type: "empty"});
		const plugin = new module.default();
		plugin.app = {
			workspace: {
				getLeavesOfType: () => [],
				revealLeaf: async () => {
					throw new Error("first open should not reveal another leaf");
				},
			},
		};
		plugin.indexer = {
			getEntryByPath: async (path) => ({
				path,
				feishu_url: "https://www.feishu.cn/wiki/docabc",
				feishu_title: "Doc",
			}),
		};
		plugin.settings = {
			frameZoom: 1,
			frameCustomCss: "",
			hideFeishuHeader: true,
		};

		plugin.registerLarkMarkdownRouting();
		await targetLeaf.setViewState({
			type: "markdown",
			state: {file: "Feishu/Doc.lark.md"},
		});

		const targetCalls = globalThis.__obsidianLarkRoutingOriginalCalls
			.filter((call) => call.leaf === targetLeaf);
		assert.equal(targetCalls.length, 1);
		assert.equal(targetCalls[0].viewState.type, "feishu-doc-view");
		assert.equal(targetCalls[0].viewState.state.file, undefined);
		assert.equal(targetCalls[0].viewState.state.sourcePath, "Feishu/Doc.lark.md");
		assert.equal(targetCalls[0].viewState.state.url, "https://www.feishu.cn/wiki/docabc");
	} finally {
		await cleanup();
	}
});
