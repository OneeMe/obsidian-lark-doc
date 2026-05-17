import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadFrontmatterModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-test-"));
	const outfile = join(tempDir, "feishu-frontmatter.mjs");

	await esbuild.build({
		entryPoints: ["src/feishu-frontmatter.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
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
		cleanup: () => rm(tempDir, {recursive: true, force: true}),
	};
}

test("reads Feishu front matter from .lark file content when metadata cache is empty", async () => {
	const {module, cleanup} = await loadFrontmatterModule();
	try {
		const content = [
			"---",
			"feishu_doc_id: abc123",
			"feishu_url: https://my.feishu.cn/wiki/abc123",
			"feishu_title: Project Plan",
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
		const file = {extension: "lark", path: "Feishu/Project Plan.lark"};

		const frontmatter = await module.readFeishuFrontMatter(app, file);

		assert.deepEqual(frontmatter, {
			feishu_doc_id: "abc123",
			feishu_url: "https://my.feishu.cn/wiki/abc123",
			feishu_title: "Project Plan",
		});
	} finally {
		await cleanup();
	}
});
