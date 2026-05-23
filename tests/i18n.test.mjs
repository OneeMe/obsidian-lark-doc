import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadI18nModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-i18n-test-"));
	const outfile = join(tempDir, "i18n.mjs");

	await esbuild.build({
		entryPoints: ["src/i18n.ts"],
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

test("translate resolves configured language and interpolates values", async () => {
	const {module, cleanup} = await loadI18nModule();
	try {
		assert.equal(module.resolveLanguage("auto", "zh-Hans-CN"), "zh-CN");
		assert.equal(module.resolveLanguage("auto", "en-US"), "en");
		assert.equal(module.resolveLanguage("fr-FR", "zh-CN"), "en");

		assert.equal(
			module.translate("zh-CN", "command.addLinkedFeishuDocument"),
			"添加关联 Lark 文档"
		);
		assert.equal(
			module.translate("zh-CN", "notice.syncedFeishuTitle", {name: "测试.lark.md"}),
			"已同步 Lark 标题：测试.lark.md"
		);
			assert.equal(
				module.translate("en", "notice.syncedFeishuTitle", {name: "Test.lark.md"}),
				"Synced Lark title for Test.lark.md"
			);
			assert.equal(
				module.translate("zh-CN", "error.larkCliNotFound", {cliPath: "lark-cli"}),
				"未找到 Lark CLI。当前配置：lark-cli。Obsidian 可能没有继承终端 PATH。请在插件设置中填写 Lark CLI 的绝对路径。"
			);
			assert.equal(
				module.translate("en", "error.larkCliNotFound", {cliPath: "lark-cli"}),
				"Lark CLI was not found. Current value: lark-cli. Obsidian may not inherit your terminal PATH. Set an absolute path to Lark CLI in plugin settings."
			);
		} finally {
			await cleanup();
		}
	});

test("translate detects runtime locales and handles missing interpolation values", async () => {
	const {module, cleanup} = await loadI18nModule();
	const previousMoment = globalThis.moment;
	const previousDocument = globalThis.document;
	const previousNavigator = globalThis.navigator;
	try {
		globalThis.moment = {locale: () => "zh-CN"};
		assert.equal(module.translate("auto", "command.createFeishuDocument"), "新建 Lark 文档");

		delete globalThis.moment;
		globalThis.document = {documentElement: {lang: "zh-Hans-CN"}};
		assert.equal(module.translate("auto", "command.removeFeishuAssociation"), "移除 Lark 关联");

		delete globalThis.document;
		Object.defineProperty(globalThis, "navigator", {
			value: {language: "zh-Hans-CN"},
			configurable: true,
		});
		assert.equal(module.translate("auto", "button.save"), "保存");

		Object.defineProperty(globalThis, "navigator", {
			value: undefined,
			configurable: true,
		});
		assert.equal(module.translate("auto", "button.add"), "Add");

		assert.equal(module.resolveLanguage("zh-Hant"), "zh-CN");
		assert.equal(module.translate("en", "missing.translation.key"), "missing.translation.key");
		assert.equal(module.createTranslator("en")("notice.templateNotFound"), "Template not found: ");
		assert.equal(
			module.createTranslator("en")("notice.templateNotFound", {path: 123}),
			"Template not found: 123"
		);
	} finally {
		if (previousMoment === undefined) {
			delete globalThis.moment;
		} else {
			globalThis.moment = previousMoment;
		}
		if (previousDocument === undefined) {
			delete globalThis.document;
		} else {
			globalThis.document = previousDocument;
		}
		if (previousNavigator === undefined) {
			delete globalThis.navigator;
		} else {
			Object.defineProperty(globalThis, "navigator", {
				value: previousNavigator,
				configurable: true,
			});
		}
		await cleanup();
	}
});
