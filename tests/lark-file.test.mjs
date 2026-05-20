import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadLarkFileModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-feishu-lark-file-test-"));
	const outfile = join(tempDir, "lark-file.mjs");

	await esbuild.build({
		entryPoints: ["src/lark-file.ts"],
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

test("identifies Feishu shadow notes by the .lark.md suffix", async () => {
	const {module, cleanup} = await loadLarkFileModule();
	try {
		assert.equal(module.isLarkMarkdownPath("Feishu/Project Plan.lark.md"), true);
		assert.equal(module.isLarkMarkdownPath("Feishu/Project Plan.md"), false);
		assert.equal(module.isLarkMarkdownPath("Feishu/Project Plan.lark"), false);

		assert.equal(
			module.isLarkMarkdownFile({extension: "md", path: "Feishu/Project Plan.lark.md"}),
			true
		);
		assert.equal(
			module.isLarkMarkdownFile({extension: "lark", path: "Feishu/Project Plan.lark"}),
			false
		);
	} finally {
		await cleanup();
	}
});

test("preserves .lark.md when syncing a Feishu shadow note title", async () => {
	const {module, cleanup} = await loadLarkFileModule();
	try {
		assert.equal(
			module.getSyncedMarkdownFilename(
				{extension: "md", path: "Feishu/Old title.lark.md"},
				"New title"
			),
			"New title.lark.md"
		);
		assert.equal(
			module.getSyncedMarkdownFilename(
				{extension: "md", path: "Notes/Regular note.md"},
				"New title"
			),
			"New title.md"
		);
	} finally {
		await cleanup();
	}
});

test("extracts a .lark.md file path from markdown view state", async () => {
	const {module, cleanup} = await loadLarkFileModule();
	try {
		assert.equal(
			module.getLarkMarkdownPathFromViewState({
				type: "markdown",
				state: {file: "Feishu/Project Plan.lark.md"},
			}),
			"Feishu/Project Plan.lark.md"
		);
		assert.equal(
			module.getLarkMarkdownPathFromViewState({
				type: "markdown",
				state: {file: "Feishu/Project Plan.md"},
			}),
			undefined
		);
		assert.equal(
			module.getLarkMarkdownPathFromViewState({
				type: "feishu-doc-view",
				state: {file: "Feishu/Project Plan.lark.md"},
			}),
			undefined
		);
	} finally {
		await cleanup();
	}
});
