import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadDocCreatorModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-doc-creator-test-"));
	const outfile = join(tempDir, "doc-creator.mjs");

	await esbuild.build({
		entryPoints: ["src/doc-creator.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "obsidian-doc-creator-test-stubs",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-doc-creator-test-stubs",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-doc-creator-test-stubs"}, () => ({
						loader: "js",
						contents: `
							class FakeElement {
								constructor(tag = "div", text = "") {
									this.tag = tag;
									this.text = text;
									this.children = [];
									this.placeholder = "";
									this.disabled = false;
									this.textContent = text;
									this.value = "";
									this.checked = false;
									this.listeners = {};
								}
								empty() {
									this.children = [];
								}
								createDiv() {
									const child = new FakeElement("div");
									this.children.push(child);
									return child;
								}
								createEl(tag, options = {}) {
									const child = new FakeElement(tag, options.text ?? "");
									child.cls = options.cls;
									child.type = options.type;
									this.children.push(child);
									return child;
								}
								addEventListener(type, listener) {
									this.listeners[type] = listener;
								}
								dispatchEvent(type) {
									this.listeners[type]?.({target: this});
								}
							}

							export class Modal {
								constructor(app) {
									this.app = app;
									this.contentEl = new FakeElement("root");
								}
								close() {}
							}

							export class Notice {}
						`,
					}));
						build.onResolve({filter: /lark-cli$/}, () => ({
							path: "lark-cli",
							namespace: "obsidian-doc-creator-test-stubs",
						}));
						build.onLoad({filter: /^lark-cli$/, namespace: "obsidian-doc-creator-test-stubs"}, () => ({
							loader: "js",
							contents: `
								globalThis.__obsidianFeishuDocCreatorCreateDocCalls = [];
								globalThis.__obsidianFeishuDocCreatorCreateBaseCalls = [];
								export async function createFeishuDocument(...args) {
									globalThis.__obsidianFeishuDocCreatorCreateDocCalls.push(args);
									return {
										docId: "wikabc",
										url: "https://my.feishu.cn/wiki/wikabc",
										title: "Created Doc",
									};
								}
								export async function createFeishuBase(...args) {
									globalThis.__obsidianFeishuDocCreatorCreateBaseCalls.push(args);
									return {
										docId: "basabc",
										url: "https://my.feishu.cn/base/basabc",
										title: "Created Base",
									};
								}
								export function formatLarkCliError(err) {
									return err instanceof Error ? err.message : String(err);
								}
							`,
						}));
					build.onResolve({filter: /lark-note$/}, () => ({
						path: "lark-note",
						namespace: "obsidian-doc-creator-test-stubs",
					}));
					build.onLoad({filter: /^lark-note$/, namespace: "obsidian-doc-creator-test-stubs"}, () => ({
						loader: "js",
						contents: `
							globalThis.__obsidianFeishuDocCreatorCreateNoteCalls = [];
							export async function createLarkMarkdownNote(app, options) {
								globalThis.__obsidianFeishuDocCreatorCreateNoteCalls.push(options);
								return {path: options.title + ".lark.md"};
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

function flattenElements(element) {
	return [element, ...element.children.flatMap(flattenElements)];
}

function resetDocCreatorStubs() {
	globalThis.__obsidianFeishuDocCreatorCreateDocCalls = [];
	globalThis.__obsidianFeishuDocCreatorCreateBaseCalls = [];
	globalThis.__obsidianFeishuDocCreatorCreateNoteCalls = [];
}

test("CreateFeishuDocModal asks for a title and document type", async () => {
	const {module, cleanup} = await loadDocCreatorModule();
	try {
		resetDocCreatorStubs();
		const modal = new module.CreateFeishuDocModal({}, {
			t: (key) => key,
			settings: {
				larkCliPath: "lark-cli",
				feishuTenantDomain: "my.feishu.cn",
				defaultNoteFolder: "Feishu",
				noteTemplate: "",
			},
		});

		modal.onOpen();

		const elements = flattenElements(modal.contentEl);
		assert.equal(elements.filter((element) => element.tag === "input" && element.type === "text").length, 1);
		assert.equal(elements.filter((element) => element.tag === "input" && element.type === "radio").length, 2);
		assert.ok(elements.some((element) => element.text === "modal.resourceType.label"));
		assert.ok(elements.some((element) => element.text === "modal.resourceType.doc"));
		assert.ok(elements.some((element) => element.text === "modal.resourceType.base"));
		assert.equal(elements.filter((element) => element.tag === "textarea").length, 0);
		assert.equal(elements.some((element) => element.text === "Initial content (optional)"), false);

		const baseRadio = elements.find((element) => element.tag === "input" && element.type === "radio" && element.value === "base");
		baseRadio.dispatchEvent("change");
		modal.onClose();
		assert.equal(modal.contentEl.children.length, 0);
	} finally {
		await cleanup();
	}
});

test("CreateFeishuDocModal creates a document by default", async () => {
	const {module, cleanup} = await loadDocCreatorModule();
	try {
		resetDocCreatorStubs();
		const openedFiles = [];
		const modal = new module.CreateFeishuDocModal({
			workspace: {
				getLeaf: () => ({
					openFile: async (file) => openedFiles.push(file),
				}),
			},
		}, {
			t: (key, vars = {}) => `${key}${vars.title ? `:${vars.title}` : ""}`,
			settings: {
				larkCliPath: "lark-cli",
				feishuTenantDomain: "my.feishu.cn",
				defaultNoteFolder: "Lark",
				noteTemplate: "",
			},
		});

		modal.onOpen();
		const titleInput = flattenElements(modal.contentEl)
			.find((element) => element.tag === "input" && element.type === "text");
		titleInput.value = "Roadmap Doc";

		await modal.create();

		assert.deepEqual(globalThis.__obsidianFeishuDocCreatorCreateDocCalls[0], [
			"lark-cli",
			"Roadmap Doc",
			"my.feishu.cn",
		]);
		assert.equal(globalThis.__obsidianFeishuDocCreatorCreateBaseCalls.length, 0);
		assert.equal(globalThis.__obsidianFeishuDocCreatorCreateNoteCalls[0].docId, "wikabc");
		assert.equal(globalThis.__obsidianFeishuDocCreatorCreateNoteCalls[0].url, "https://my.feishu.cn/wiki/wikabc");
		assert.equal(openedFiles[0].path, "Created Doc.lark.md");
	} finally {
		await cleanup();
	}
});

test("CreateFeishuDocModal creates a Base when Base is selected", async () => {
	const {module, cleanup} = await loadDocCreatorModule();
	try {
		resetDocCreatorStubs();
		const openedFiles = [];
		const modal = new module.CreateFeishuDocModal({
			workspace: {
				getLeaf: () => ({
					openFile: async (file) => openedFiles.push(file),
				}),
			},
		}, {
			t: (key, vars = {}) => `${key}${vars.title ? `:${vars.title}` : ""}`,
			settings: {
				larkCliPath: "lark-cli",
				feishuTenantDomain: "my.feishu.cn",
				defaultNoteFolder: "Lark",
				noteTemplate: "",
			},
		});

		modal.onOpen();
		const elements = flattenElements(modal.contentEl);
		const titleInput = elements.find((element) => element.tag === "input" && element.type === "text");
		const baseRadio = elements.find((element) => element.tag === "input" && element.type === "radio" && element.value === "base");
		titleInput.value = "Roadmap Base";
		baseRadio.checked = true;
		baseRadio.dispatchEvent("change");

		await modal.create();

		assert.deepEqual(globalThis.__obsidianFeishuDocCreatorCreateBaseCalls[0], [
			"lark-cli",
			"Roadmap Base",
			"my.feishu.cn",
		]);
		assert.equal(globalThis.__obsidianFeishuDocCreatorCreateDocCalls.length, 0);
		assert.equal(globalThis.__obsidianFeishuDocCreatorCreateNoteCalls[0].docId, "basabc");
		assert.equal(globalThis.__obsidianFeishuDocCreatorCreateNoteCalls[0].url, "https://my.feishu.cn/base/basabc");
		assert.equal(openedFiles[0].path, "Created Base.lark.md");
	} finally {
		await cleanup();
	}
});
