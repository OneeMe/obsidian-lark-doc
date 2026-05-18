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
					title: "Sync Feishu title and filename",
				},
			]
		);
	} finally {
		await cleanup();
	}
});
