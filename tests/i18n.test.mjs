import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadI18nModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-feishu-i18n-test-"));
	const outfile = join(tempDir, "i18n.mjs");

	await esbuild.build({
		entryPoints: ["src/i18n.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		outfile,
	});

	const imported = await import(pathToFileURL(outfile).href);
	return {
		module: imported,
		cleanup: () => rm(tempDir, {recursive: true, force: true}),
	};
}

test("translate resolves configured language and interpolates values", async () => {
	const {module, cleanup} = await loadI18nModule();
	try {
		assert.equal(module.resolveLanguage("auto", "zh-Hans-CN"), "zh-CN");
		assert.equal(module.resolveLanguage("auto", "en-US"), "en");
		assert.equal(module.resolveLanguage("fr-FR", "zh-CN"), "en");

		assert.equal(
			module.translate("zh-CN", "command.addLinkedFeishuDocument"),
			"添加关联飞书文档"
		);
		assert.equal(
			module.translate("zh-CN", "notice.syncedFeishuTitle", {name: "测试.lark.md"}),
			"已同步飞书标题：测试.lark.md"
		);
		assert.equal(
			module.translate("en", "notice.syncedFeishuTitle", {name: "Test.lark.md"}),
			"Synced Feishu title for Test.lark.md"
		);
	} finally {
		await cleanup();
	}
});
