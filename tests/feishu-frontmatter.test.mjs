import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadFrontmatterModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-test-"));
	const outfile = join(tempDir, "feishu-frontmatter.mjs");

	await esbuild.build({
		entryPoints: ["src/feishu-frontmatter.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "obsidian-test-stub",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-test-stub",
					}));
					build.onLoad({filter: /.*/, namespace: "obsidian-test-stub"}, () => ({
						loader: "js",
						contents: `
							export function getFrontMatterInfo(content) {
								if (!content.startsWith("---\\n")) {
									return {exists: false, frontmatter: ""};
								}
								const end = content.indexOf("\\n---", 4);
								if (end < 0) {
									return {exists: false, frontmatter: ""};
								}
								return {exists: true, frontmatter: content.slice(4, end)};
							}

							export function parseYaml(yaml) {
								if (yaml.includes("THROW")) throw new Error("bad yaml");
								const result = {};
								for (const line of yaml.split("\\n")) {
									const index = line.indexOf(":");
									if (index < 0) continue;
									const key = line.slice(0, index).trim();
									const value = line.slice(index + 1).trim();
									result[key] = value;
								}
								return result;
							}

							export class TFile {}
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

test("reads Feishu front matter from .lark.md file content when metadata cache is empty", async () => {
	const {module, cleanup} = await loadFrontmatterModule();
	try {
		const content = [
			"---",
			"lark_doc_id: abc123",
			"lark_url: https://my.feishu.cn/wiki/abc123",
			"lark_title: Project Plan",
			"---",
			"",
			"Shadow file body",
		].join("\n");
		const app = {
			metadataCache: {
				getFileCache: () => null,
			},
			vault: {
				cachedRead: async () => content,
			},
		};
		const file = {extension: "md", path: "Feishu/Project Plan.lark.md"};

		const frontmatter = await module.readFeishuFrontMatter(app, file);

		assert.deepEqual(frontmatter, {
			lark_doc_id: "abc123",
			lark_url: "https://my.feishu.cn/wiki/abc123",
			lark_title: "Project Plan",
		});
	} finally {
		await cleanup();
	}
});

test("reads cached front matter and ignores invalid front matter content", async () => {
	const {module, cleanup} = await loadFrontmatterModule();
	try {
		const file = {extension: "md", path: "Lark/Cached.lark.md"};
		const app = {
			metadataCache: {
				getFileCache: () => ({
					frontmatter: {
						lark_doc_id: " cached ",
						lark_url: " https://my.feishu.cn/wiki/cached ",
						lark_title: " Cached Title ",
					},
				}),
			},
			vault: {
				cachedRead: async () => {
					throw new Error("cachedRead should not run");
				},
			},
		};

		assert.deepEqual(await module.readFeishuFrontMatter(app, file), {
			lark_doc_id: "cached",
			lark_url: "https://my.feishu.cn/wiki/cached",
			lark_title: "Cached Title",
		});

		assert.equal(module.parseFeishuFrontMatterContent("plain body"), undefined);
		assert.equal(module.parseFeishuFrontMatterContent("---\nTHROW\n---"), undefined);
		assert.equal(module.normalizeFeishuFrontMatter(null), undefined);
		assert.equal(module.normalizeFeishuFrontMatter({lark_doc_id: "   ", lark_url: "   "}), undefined);
		assert.equal(module.normalizeFeishuFrontMatter({lark_title: "Only title"}), undefined);
		assert.deepEqual(module.normalizeFeishuFrontMatter({lark_doc_id: 123, lark_url: " url "}), {
			lark_url: "url",
		});
	} finally {
		await cleanup();
	}
});
