import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadIndexerModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-indexer-test-"));
	const outfile = join(tempDir, "indexer.mjs");

	await esbuild.build({
		entryPoints: ["src/indexer.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
		plugins: [
			{
				name: "obsidian-indexer-test-stubs",
				setup(build) {
					build.onResolve({filter: /^obsidian$/}, () => ({
						path: "obsidian",
						namespace: "obsidian-indexer-test-stubs",
					}));
					build.onResolve({filter: /feishu-frontmatter$/}, () => ({
						path: "feishu-frontmatter",
						namespace: "obsidian-indexer-test-stubs",
					}));
					build.onLoad({filter: /^obsidian$/, namespace: "obsidian-indexer-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export class TFile {}
							globalThis.__obsidianIndexerTestTFile = TFile;
						`,
					}));
					build.onLoad({filter: /^feishu-frontmatter$/, namespace: "obsidian-indexer-test-stubs"}, () => ({
						loader: "js",
						contents: `
							export async function readFeishuFrontMatter(_app, file) {
								return globalThis.__obsidianIndexerFrontMatter?.(file);
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

test("FeishuIndexer reads associations and builds normalized index entries", async () => {
	const {module, cleanup} = await loadIndexerModule();
	try {
		const TFile = globalThis.__obsidianIndexerTestTFile;
		const file = new TFile();
		file.path = "Lark/Doc.lark.md";
		file.stat = {mtime: 123};

		let frontMatter;
		globalThis.__obsidianIndexerFrontMatter = () => frontMatter;

		const app = {
			vault: {
				getAbstractFileByPath: (path) => path === file.path ? file : null,
			},
		};
		const indexer = new module.FeishuIndexer(app);

		frontMatter = undefined;
		assert.equal(await indexer.hasFeishuAssociation(file), false);
		assert.equal(await indexer.getEntryByPath(file.path), undefined);
		assert.equal(await indexer.getEntryByPath("Missing.md"), undefined);

		frontMatter = {
			feishu_url: "https://one.feishu.cn/wiki/docabc?from=share",
			feishu_title: "Remote Title",
		};
		assert.equal(await indexer.hasFeishuAssociation(file), true);
		assert.deepEqual(await indexer.getEntryByPath(file.path), {
			path: "Lark/Doc.lark.md",
			feishu_doc_id: "docabc",
			feishu_url: "https://one.feishu.cn/wiki/docabc",
			feishu_title: "Remote Title",
			mtime: 123,
		});

		frontMatter = {
			feishu_doc_id: "explicit",
			feishu_url: "https://one.feishu.cn/wiki/docabc?from=share",
		};
		assert.deepEqual(await indexer.getEntryByPath(file.path), {
			path: "Lark/Doc.lark.md",
			feishu_doc_id: "explicit",
			feishu_url: "https://one.feishu.cn/wiki/docabc",
			feishu_title: undefined,
			mtime: 123,
		});

		frontMatter = {
			feishu_doc_id: "",
			feishu_url: "",
		};
		assert.equal(await indexer.getEntryByPath(file.path), undefined);

		frontMatter = {};
		assert.equal(await indexer.getEntryByPath(file.path), undefined);
	} finally {
		delete globalThis.__obsidianIndexerFrontMatter;
		await cleanup();
	}
});
