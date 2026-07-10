import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadFeishuViewModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-view-test-"));
	const outfile = join(tempDir, "feishu-view.mjs");

	await esbuild.build({
		entryPoints: ["src/feishu-view.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
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

							export class Component {
								constructor() {
									this.cleanups = [];
									this.children = [];
								}
								addChild(component) {
									this.children.push(component);
									return component;
								}
								removeChild(component) {
									this.children = this.children.filter((child) => child !== component);
									component.unload?.();
									return component;
								}
								register(callback) {
									this.cleanups.push(callback);
								}
								registerDomEvent(el, type, callback, options) {
									el.addEventListener?.(type, callback, options);
									this.register(() => el.removeEventListener?.(type, callback, options));
								}
								unload() {
									for (const cleanup of this.cleanups.splice(0)) {
										cleanup();
									}
									for (const child of this.children.splice(0)) {
										child.unload?.();
									}
								}
							}

							export class FileView extends Component {
								constructor(leaf) {
									super();
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
									return this.file ? {file: this.file.path} : {};
								}
								async setState() {}
							}

							export class MarkdownView {}
							export class Notice {
								constructor(message) {
									globalThis.__obsidianFeishuViewNotices.push(message);
								}
							}
							export class TFile {}
							globalThis.__obsidianFeishuViewTFile = TFile;
							export const Platform = {isMacOS: true};

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
		cleanup: () => process.env.NODE_V8_COVERAGE ? Promise.resolve() : rm(tempDir, {recursive: true, force: true}),
	};
}

function resetNoticeStub() {
	globalThis.__obsidianFeishuViewNotices = [];
}

function installDocumentStub() {
	const previousDocument = globalThis.document;
	globalThis.document = {
		documentElement: {lang: "en"},
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

function createCssWebviewStub() {
	const inserted = [];
	const removed = [];
	return {
		inserted,
		removed,
		webview: {
			src: "",
			style: {},
			addEventListener() {},
			insertCSS: async (css) => {
				inserted.push(css);
				return `css-${inserted.length}`;
			},
			removeInsertedCSS: async (key) => {
				removed.push(key);
			},
		},
	};
}

test("FeishuDocView replaces Obsidian navigation with sync and copy actions", async () => {
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		resetNoticeStub();
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
				{
					icon: "copy",
					title: "Copy Lark link",
				},
			]
		);
	} finally {
		delete globalThis.__obsidianFeishuViewNotices;
		await cleanup();
	}
});

test("FeishuDocView copy action copies the current Lark document URL", async () => {
	const restoreDocument = installDocumentStub();
	const {module, cleanup} = await loadFeishuViewModule();
	const previousNavigator = globalThis.navigator;
	try {
		resetNoticeStub();
		let copiedText = "";
		Object.defineProperty(globalThis, "navigator", {
			configurable: true,
			value: {
				clipboard: {
					writeText: async (text) => {
						copiedText = text;
					},
				},
			},
		});
		const view = new module.FeishuDocView({
			app: {
				metadataCache: {getFileCache: () => null},
				vault: {cachedRead: async () => ""},
			},
		});

		await view.onOpen();
		await view.setState({
			url: "https://www.feishu.cn/wiki/docabc",
			title: "Doc",
			sourcePath: "Feishu/Doc.lark.md",
		}, {});
		const copyAction = view.actions.find((action) => action.icon === "copy");
		assert.ok(copyAction);

		copyAction.callback();
		await Promise.resolve();

		assert.equal(copiedText, "https://www.feishu.cn/wiki/docabc");
		assert.deepEqual(globalThis.__obsidianFeishuViewNotices, ["Copied Lark document link."]);
	} finally {
		if (previousNavigator === undefined) {
			delete globalThis.navigator;
		} else {
			Object.defineProperty(globalThis, "navigator", {
				configurable: true,
				value: previousNavigator,
			});
		}
		delete globalThis.__obsidianFeishuViewNotices;
		restoreDocument();
		await cleanup();
	}
});

test("FeishuDocView injectCss does not add Obsidian theme CSS", async () => {
	const restoreDocument = installDocumentStub();
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const view = new module.FeishuDocView({
			app: {
				metadataCache: {getFileCache: () => null},
				vault: {cachedRead: async () => ""},
			},
		});
		const cssStub = createCssWebviewStub();
		view.webviewEl = cssStub.webview;

		await view.injectCss("html { --custom: yes; }", false);

		assert.equal(cssStub.inserted.length, 1);
		assert.equal(cssStub.inserted[0].trim(), "html { --custom: yes; }");
		assert.doesNotMatch(cssStub.inserted[0], /obsidian-lark-doc-theme/);
		assert.doesNotMatch(cssStub.inserted[0], /color-scheme/);
		assert.doesNotMatch(cssStub.inserted[0], /theme-light|theme-dark/);
		assert.doesNotMatch(cssStub.inserted[0], /background-color: #(?:191919|ffffff)/);

		await view.injectCss("", false);

		assert.equal(cssStub.inserted.length, 1);
		assert.deepEqual(cssStub.removed, ["css-1"]);
	} finally {
		restoreDocument();
		await cleanup();
	}
});

test("openFeishuView includes file and source path so Obsidian can select the source file", async () => {
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
			lark_url: "https://www.feishu.cn/wiki/docabc",
			lark_title: "Doc",
		});

		assert.equal(calls.length, 1);
		assert.equal(calls[0].type, module.FEISHU_VIEW_TYPE);
		assert.equal(calls[0].state.file, "Feishu/Doc.lark.md");
		assert.equal(calls[0].state.sourcePath, "Feishu/Doc.lark.md");
	} finally {
		await cleanup();
	}
});

test("openFeishuView reveals an existing leaf for the same source file without refreshing it", async () => {
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const activeCalls = [];
		const existingCalls = [];
		const activeLeaf = {
			getViewState: () => ({type: "markdown"}),
			setViewState: async (state) => {
				activeCalls.push(state);
			},
		};
		const existingLeaf = {
			getViewState: () => ({
				type: module.FEISHU_VIEW_TYPE,
				state: {
					file: "Feishu/Doc.lark.md",
					sourcePath: "Feishu/Doc.lark.md",
				},
			}),
			setViewState: async (state) => {
				existingCalls.push(state);
			},
		};
		const revealedLeaves = [];
		const app = {
			workspace: {
				getMostRecentLeaf: () => activeLeaf,
				getActiveViewOfType: () => null,
				getLeavesOfType: (type) => type === module.FEISHU_VIEW_TYPE ? [existingLeaf] : [],
				getRightLeaf: () => null,
				revealLeaf: async (leaf) => {
					revealedLeaves.push(leaf);
				},
			},
		};

		await module.openFeishuView(app, {
			path: "Feishu/Doc.lark.md",
			lark_url: "https://www.feishu.cn/wiki/docabc",
			lark_title: "Doc",
		});

		assert.equal(activeCalls.length, 0);
		assert.equal(existingCalls.length, 0);
		assert.deepEqual(revealedLeaves, [existingLeaf]);
	} finally {
		await cleanup();
	}
});

test("openFeishuView loads a deferred existing leaf before revealing it without refreshing state", async () => {
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const calls = [];
		const existingLeaf = {
			getViewState: () => ({
				type: module.FEISHU_VIEW_TYPE,
				state: {
					file: "Feishu/Doc.lark.md",
					sourcePath: "Feishu/Doc.lark.md",
				},
			}),
			setViewState: async (state) => {
				throw new Error(`existing leaf should not be refreshed: ${JSON.stringify(state)}`);
			},
			loadIfDeferred: async () => {
				calls.push("load");
			},
		};
		const app = {
			workspace: {
				getMostRecentLeaf: () => null,
				getActiveViewOfType: () => null,
				getLeavesOfType: (type) => type === module.FEISHU_VIEW_TYPE ? [existingLeaf] : [],
				getRightLeaf: () => null,
				revealLeaf: async (leaf) => {
					assert.equal(leaf, existingLeaf);
					calls.push("reveal");
				},
			},
		};

		await module.openFeishuView(app, {
			path: "Feishu/Doc.lark.md",
			lark_url: "https://www.feishu.cn/wiki/docabc",
			lark_title: "Doc",
		});

		assert.deepEqual(calls, ["load", "reveal"]);
	} finally {
		await cleanup();
	}
});

test("FeishuDocView setState loads URL state without invoking FileView file loading", async () => {
	const restoreDocument = installDocumentStub();
	const {module, cleanup} = await loadFeishuViewModule();
	try {
		const TFile = globalThis.__obsidianFeishuViewTFile;
		const sourceFile = new TFile();
		sourceFile.path = "Feishu/Doc.lark.md";
		const superStates = [];
		const view = new module.FeishuDocView({
			app: {
				metadataCache: {getFileCache: () => null},
				vault: {
					cachedRead: async () => "",
					getAbstractFileByPath: (path) => path === sourceFile.path ? sourceFile : null,
				},
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

		assert.equal(superStates.length, 0);
		assert.equal(view.file, sourceFile);
		assert.equal(view.getState().sourcePath, "Feishu/Doc.lark.md");
		assert.equal(view.getState().file, "Feishu/Doc.lark.md");
		assert.equal(view.getState().url, "https://www.feishu.cn/wiki/docabc");
	} finally {
		restoreDocument();
		await cleanup();
	}
});
