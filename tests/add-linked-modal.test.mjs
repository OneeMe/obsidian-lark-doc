import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadMainModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-add-linked-test-"));
	const outfile = join(tempDir, "main.mjs");

	await esbuild.build({
		entryPoints: ["src/main.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
		plugins: [
			{
				name: "obsidian-add-linked-test-stubs",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-add-linked-test-stubs",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
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
								addEventListener() {}
							}

							export class Modal {
								constructor(app) {
									this.app = app;
									this.contentEl = new FakeElement("root");
								}
								close() {}
							}

							export class Notice {}
							export class Plugin {}
							export class TFile {}
							export class WorkspaceLeaf {}
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
					]) {
						build.onResolve({filter: new RegExp(`${moduleName}$`)}, () => ({
							path: moduleName,
							namespace: "obsidian-add-linked-test-stubs",
						}));
					}

					build.onLoad({filter: /^feishu-view$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export class FeishuDocView {}
							export const FEISHU_VIEW_TYPE = "feishu-doc-view";
							export async function openFeishuView() {}
						`,
					}));
					build.onLoad({filter: /^indexer$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: "export class FeishuIndexer {}",
					}));
					build.onLoad({filter: /^settings$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export const DEFAULT_SETTINGS = {language: "en"};
							export class FeishuSettingTab {}
						`,
					}));
					build.onLoad({filter: /^types$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function parseFeishuUrl(url) {
								if (!url) return null;
								return {docId: "docabc", url};
							}
						`,
					}));
					build.onLoad({filter: /^doc-creator$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: "export class CreateFeishuDocModal {}",
					}));
					build.onLoad({filter: /^title-sync$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function syncTitle() { return false; }",
					}));
					build.onLoad({filter: /^base-manager$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export async function ensureBaseFile() {}
							export function getBaseFilePath() { return "Feishu Documents.base"; }
						`,
					}));
					build.onLoad({filter: /^feishu-frontmatter$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function readFeishuFrontMatter() { return null; }",
					}));
					build.onLoad({filter: /^lark-file$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export function getLarkMarkdownPathFromViewState() { return null; }
							export function isLarkMarkdownFile() { return false; }
						`,
					}));
					build.onLoad({filter: /^lark-note$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							globalThis.__obsidianFeishuAddLinkedCreateCalls = [];
							export async function createLarkMarkdownNote(app, options) {
								globalThis.__obsidianFeishuAddLinkedCreateCalls.push(options);
								return {path: options.title + ".lark.md"};
							}
						`,
					}));
					build.onLoad({filter: /^lark-cli$/, namespace: "obsidian-add-linked-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export async function fetchFeishuDocumentTitle() {
								return "Real Feishu Title";
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

function flattenElements(element) {
	return [element, ...element.children.flatMap(flattenElements)];
}

test("AddLinkedFeishuDocumentModal only asks for a Feishu document URL", async () => {
	const {module, cleanup} = await loadMainModule();
	try {
		const modal = new module.AddLinkedFeishuDocumentModal({}, {
			t: (key) => key,
			settings: {
				defaultNoteFolder: "Feishu",
				noteTemplate: "",
			},
		});

		modal.onOpen();

		const elements = flattenElements(modal.contentEl);
		assert.equal(elements.filter((element) => element.tag === "input").length, 1);
		assert.equal(elements.some((element) => element.text === "modal.documentTitleOptional.label"), false);
	} finally {
		await cleanup();
	}
});

test("AddLinkedFeishuDocumentModal creates the local file with the Feishu document title", async () => {
	const {module, cleanup} = await loadMainModule();
	try {
		const openedFiles = [];
		const modal = new module.AddLinkedFeishuDocumentModal({
			workspace: {
				getLeaf: () => ({
					openFile: async (file) => openedFiles.push(file),
				}),
			},
		}, {
			t: (key, vars = {}) => `${key}${vars.title ? `:${vars.title}` : ""}`,
			settings: {
				larkCliPath: "lark-cli",
				defaultNoteFolder: "Feishu",
				noteTemplate: "",
			},
		});

		modal.onOpen();
		const input = flattenElements(modal.contentEl).find((element) => element.tag === "input");
		input.value = "https://www.feishu.cn/wiki/docabc";

		await modal.add();

		assert.equal(globalThis.__obsidianFeishuAddLinkedCreateCalls.length, 1);
		assert.equal(globalThis.__obsidianFeishuAddLinkedCreateCalls[0].title, "Real Feishu Title");
		assert.equal(openedFiles[0].path, "Real Feishu Title.lark.md");
	} finally {
		await cleanup();
	}
});
