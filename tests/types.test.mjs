import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadTypesModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-types-test-"));
	const outfile = join(tempDir, "types.mjs");

	await esbuild.build({
		entryPoints: ["src/types.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
	});

	const imported = await import(pathToFileURL(outfile).href);
	return {
		module: imported,
		cleanup: () => process.env.NODE_V8_COVERAGE ? Promise.resolve() : rm(tempDir, {recursive: true, force: true}),
	};
}

test("parseFeishuUrl extracts and normalizes supported Feishu and Lark URLs", async () => {
	const {module, cleanup} = await loadTypesModule();
	try {
		assert.equal(
			module.extractDocIdFromUrl("https://one.feishu.cn/docs/docabc?from=share#heading"),
			"docabc"
		);
		assert.equal(
			module.extractDocIdFromUrl("https://one.larksuite.com/docx/docxyz"),
			"docxyz"
		);
		assert.equal(module.extractDocIdFromUrl("https://example.com/wiki/docabc"), undefined);

		assert.equal(
			module.normalizeFeishuUrl(" https://one.feishu.cn/wiki/docabc?x=1#top "),
			"https://one.feishu.cn/wiki/docabc"
		);
		assert.equal(module.normalizeFeishuUrl("not a url"), "not a url");

		assert.deepEqual(
			module.parseFeishuUrl("https://one.larksuite.com/wiki/wikabc?x=1"),
			{
				docId: "wikabc",
				url: "https://one.larksuite.com/wiki/wikabc",
			}
		);
		assert.equal(
			module.extractDocIdFromUrl("https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg?table=tblsYP1w34jd4IjF&view=vew9iPxyp2"),
			"EdJrbY6hdaPwvBskGRhctq7rndg"
		);
		assert.equal(
			module.normalizeFeishuUrl("https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg?table=tblsYP1w34jd4IjF&view=vew9iPxyp2&from=share#top"),
			"https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg?table=tblsYP1w34jd4IjF&view=vew9iPxyp2"
		);
		assert.equal(
			module.normalizeFeishuUrl("https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg?from=share#top"),
			"https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg"
		);
		assert.equal(module.isFeishuBaseUrl("my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg"), true);
		assert.deepEqual(
			module.parseFeishuUrl("https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg?table=tblsYP1w34jd4IjF&view=vew9iPxyp2"),
			{
				docId: "EdJrbY6hdaPwvBskGRhctq7rndg",
				url: "https://my.feishu.cn/base/EdJrbY6hdaPwvBskGRhctq7rndg?table=tblsYP1w34jd4IjF&view=vew9iPxyp2",
			}
		);
		assert.equal(module.parseFeishuUrl("https://example.com/nope"), undefined);
	} finally {
		await cleanup();
	}
});
