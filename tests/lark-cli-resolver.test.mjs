import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadResolverModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-lark-cli-resolver-test-"));
	const outfile = join(tempDir, "lark-cli-resolver.mjs");

	await esbuild.build({
		entryPoints: ["src/lark-cli-resolver.ts"],
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

test("getEffectiveLarkCliPath uses the configured path when present", async () => {
	const {module, cleanup} = await loadResolverModule();
	try {
		assert.equal(module.getEffectiveLarkCliPath("/custom/lark-cli"), "/custom/lark-cli");
		assert.equal(module.getEffectiveLarkCliPath("  /custom/lark-cli  "), "/custom/lark-cli");
	} finally {
		await cleanup();
	}
});

test("getEffectiveLarkCliPath falls back to lark-cli without probing the filesystem", async () => {
	const {module, cleanup} = await loadResolverModule();
	try {
		assert.equal(module.getEffectiveLarkCliPath(""), "lark-cli");
		assert.equal(module.getEffectiveLarkCliPath("   "), "lark-cli");
	} finally {
		await cleanup();
	}
});
