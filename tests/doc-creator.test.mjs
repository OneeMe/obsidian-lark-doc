import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadDocCreatorModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-doc-creator-test-"));
	const outfile = join(tempDir, "doc-creator.mjs");

	await esbuild.build({
		entryPoints: ["src/doc-creator.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
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
						`,
					}));
					build.onResolve({filter: /lark-cli$/}, () => ({
						path: "lark-cli",
						namespace: "obsidian-doc-creator-test-stubs",
					}));
					build.onLoad({filter: /^lark-cli$/, namespace: "obsidian-doc-creator-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function createFeishuDocument() {}",
					}));
					build.onResolve({filter: /lark-note$/}, () => ({
						path: "lark-note",
						namespace: "obsidian-doc-creator-test-stubs",
					}));
					build.onLoad({filter: /^lark-note$/, namespace: "obsidian-doc-creator-test-stubs"}, () => ({
						loader: "js",
						contents: "export async function createLarkMarkdownNote() {}",
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

test("CreateFeishuDocModal only asks for a document title", async () => {
	const {module, cleanup} = await loadDocCreatorModule();
	try {
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
		assert.equal(elements.filter((element) => element.tag === "input").length, 1);
		assert.equal(elements.filter((element) => element.tag === "textarea").length, 0);
		assert.equal(elements.some((element) => element.text === "Initial content (optional)"), false);
	} finally {
		await cleanup();
	}
});
