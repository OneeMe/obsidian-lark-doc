import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadFeishuViewModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-view-test-"));
	const outfile = join(tempDir, "feishu-view.mjs");

	await esbuild.build({
		entryPoints: ["src/feishu-view.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		plugins: [
			{
				name: "obsidian-feishu-view-test-stub",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-feishu-view-test-stub",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-feishu-view-test-stub"}, () => ({
						loader: "js",
						contents: `
							class FakeElement {
								constructor() {
									this.children = [];
									this.classes = [];
								}
								empty() {
									this.children = [];
								}
								addClass(name) {
									this.classes.push(name);
								}
								createDiv() {
									const child = new FakeElement();
									this.children.push(child);
									return child;
								}
								createEl() {
									const child = new FakeElement();
									this.children.push(child);
									return child;
								}
								appendChild(child) {
									this.children.push(child);
								}
								querySelector() {
									return null;
								}
							}

							export class FileView {
								constructor(leaf) {
									this.leaf = leaf;
									this.app = leaf.app;
									this.file = null;
									this.navigation = true;
									this.contentEl = new FakeElement();
									this.actions = [];
								}
								addAction(icon, title, callback) {
									const action = {icon, title, callback};
									this.actions.push(action);
									return action;
								}
								getState() {
									return {};
								}
								async setState() {}
							}

							export class MarkdownView {}
							export class Notice {}
							export class TFile {}

							export function getFrontMatterInfo() {
								return {exists: false, frontmatter: ""};
							}

							export function parseYaml() {
								return {};
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

function installDocumentStub() {
	const previousDocument = globalThis.document;
	globalThis.document = {
		createElement: (tag) => ({
			tag,
			src: "",
			style: {},
			addClass() {},
			setAttribute() {},
			addEventListener() {},
		}),
	};

	return () => {
		if (previousDocument === undefined) {
			delete globalThis.document;
		} else {
			globalThis.document = previousDocument;
		}
	};
}

test("FeishuDocView replaces Obsidian navigation with a sync action", async () => {
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const view = new module.FeishuDocView({
			app: {
				metadataCache: {getFileCache: () => null},
				vault: {cachedRead: async () => ""},
			},
		});

		assert.equal(view.navigation, false);

		await view.onOpen();

		assert.deepEqual(
			view.actions.map((action) => ({icon: action.icon, title: action.title})),
			[
				{
					icon: "refresh-cw",
					title: "Sync Lark title and filename",
				},
			]
		);
	} finally {
		await cleanup();
	}
});

test("openFeishuView includes the source file in Feishu view state", async () => {
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const calls = [];
		const activeLeaf = {
			getViewState: () => ({type: "markdown"}),
			setViewState: async (state) => {
				calls.push(state);
			},
		};
		const app = {
			workspace: {
				getMostRecentLeaf: () => activeLeaf,
				getActiveViewOfType: () => null,
				getLeavesOfType: () => [],
				getRightLeaf: () => null,
				revealLeaf: async () => {},
			},
		};

		await module.openFeishuView(app, {
			path: "Feishu/Doc.lark.md",
			feishu_url: "https://www.feishu.cn/wiki/docabc",
			feishu_title: "Doc",
		});

		assert.equal(calls.length, 1);
		assert.equal(calls[0].type, module.FEISHU_VIEW_TYPE);
		assert.equal(calls[0].state.file, "Feishu/Doc.lark.md");
		assert.equal(calls[0].state.sourcePath, "Feishu/Doc.lark.md");
	} finally {
		await cleanup();
	}
});

test("FeishuDocView setState keeps file identity while loading URL state", async () => {
	const restoreDocument = installDocumentStub();
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const superStates = [];
		const view = new module.FeishuDocView({
			app: {
				metadataCache: {getFileCache: () => null},
				vault: {cachedRead: async () => ""},
			},
		});
		view.leaf = {
			app: view.app,
		};
		const fileViewPrototype = Object.getPrototypeOf(Object.getPrototypeOf(view));
		const originalSetState = fileViewPrototype.setState;
		fileViewPrototype.setState = async function (state) {
			superStates.push(state);
		};

		try {
			await view.setState({
				file: "Feishu/Doc.lark.md",
				url: "https://www.feishu.cn/wiki/docabc",
				title: "Doc",
				sourcePath: "Feishu/Doc.lark.md",
			}, {});
		} finally {
			fileViewPrototype.setState = originalSetState;
		}

		assert.equal(superStates.length, 1);
		assert.equal(view.getState().file, "Feishu/Doc.lark.md");
		assert.equal(view.getState().url, "https://www.feishu.cn/wiki/docabc");
	} finally {
		restoreDocument();
		await cleanup();
	}
});
