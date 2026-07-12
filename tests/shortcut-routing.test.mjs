import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadShortcutRoutingModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-lark-shortcut-routing-test-"));
	const outfile = join(tempDir, "shortcut-routing.mjs");

	await esbuild.build({
		entryPoints: ["src/shortcut-routing.ts"],
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

test("shortcut routing records only allowed shortcut shapes", async () => {
	const {module, cleanup} = await loadShortcutRoutingModule();
	try {
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({key: "w", metaKey: true}, "mac"),
			{type: "recorded", shortcut: "Mod+W"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({key: "k", ctrlKey: true, altKey: true, shiftKey: true}, "mac"),
			{type: "recorded", shortcut: "Ctrl+Alt+Shift+K"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({key: "F12", shiftKey: true}, "other"),
			{type: "recorded", shortcut: "Shift+F12"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({code: "F13"}, "mac"),
			{type: "recorded", shortcut: "F13"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({code: "F25"}, "mac"),
			{type: "invalid"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({code: "Space", altKey: true}, "mac"),
			{type: "recorded", shortcut: "Alt+Space"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({code: "IntlBackslash", altKey: true}, "mac"),
			{type: "recorded", shortcut: "Alt+IntlBackslash"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({}, "mac"),
			{type: "invalid"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({key: "Escape", metaKey: true}, "mac"),
			{type: "cancelled"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({key: "w"}, "mac"),
			{type: "invalid"}
		);
		assert.deepEqual(
			module.recordShortcutFromKeyboardEvent({key: "Shift", shiftKey: true}, "mac"),
			{type: "invalid"}
		);
	} finally {
		await cleanup();
	}
});

test("shortcut routing normalizes, deduplicates, and removes persisted shortcuts", async () => {
	const {module, cleanup} = await loadShortcutRoutingModule();
	try {
		assert.deepEqual(module.cleanShortcutAllowlist(undefined), ["Mod+W"]);
		assert.deepEqual(
			module.cleanShortcutAllowlist(["cmd+w", "Mod+W", "option+shift+f1", "w", "Escape", 12]),
			["Mod+W", "Alt+Shift+F1"]
		);
		assert.deepEqual(
			module.addShortcutToAllowlist(["Mod+W"], "control+alt+k"),
			["Mod+W", "Ctrl+Alt+K"]
		);
		assert.deepEqual(
			module.removeShortcutFromAllowlist(["Mod+W", "Ctrl+Alt+K"], "ctrl+alt+k"),
			["Mod+W"]
		);
		assert.equal(module.normalizeShortcutString("Mod+Alt+Shift+f24"), "Mod+Alt+Shift+F24");
		assert.equal(module.normalizeShortcutString("Mod+Alt+Shift+f25"), null);
		assert.equal(module.normalizeShortcutString(""), null);
		assert.equal(module.normalizeShortcutString("Mod"), null);
		assert.equal(module.normalizeShortcutString("Mod+W+K"), null);
		assert.equal(module.normalizeShortcutString("Mod+Shift"), null);
		assert.equal(module.normalizeShortcutString("Mod+Plus"), null);
		assert.equal(module.isRecordableShortcut(""), false);
		assert.equal(module.isRecordableShortcut("Escape"), false);
		assert.equal(module.isRecordableShortcut("Shift+W"), false);
		assert.equal(module.isRecordableShortcut("Mod"), false);
		assert.equal(module.isRecordableShortcut("Mod+F25"), false);
		assert.equal(module.isRecordableShortcut("Mod+Plus"), false);
	} finally {
		await cleanup();
	}
});

test("shortcut routing matches Mod per platform with exact modifiers", async () => {
	const {module, cleanup} = await loadShortcutRoutingModule();
	try {
		assert.equal(
			module.shortcutMatchesAllowlist({key: "w", metaKey: true}, ["Mod+W"], "mac"),
			true
		);
		assert.equal(
			module.shortcutMatchesAllowlist({key: "w", metaKey: true, shiftKey: true}, ["Mod+W"], "mac"),
			false
		);
		assert.equal(
			module.shortcutMatchesAllowlist({key: "w", ctrlKey: true}, ["Mod+W"], "other"),
			true
		);
		assert.equal(
			module.shortcutMatchesAllowlist({key: "w", ctrlKey: true}, ["Mod+W"], "mac"),
			false
		);
		assert.equal(
			module.shortcutMatchesAllowlist({code: "KeyW", modifiers: ["control"]}, ["Mod+W"], "other"),
			true
		);
		assert.equal(
			module.shortcutMatchesAllowlist({code: "Digit1", alt: true}, ["Alt+1"], "mac"),
			true
		);
		assert.equal(
			module.shortcutMatchesAllowlist({key: "Control", ctrlKey: true}, ["Mod+W"], "other"),
			false
		);
		assert.equal(
			module.shortcutMatchesAllowlist({key: "w", metaKey: true}, ["not a shortcut"], "mac"),
			false
		);
		assert.equal(
			module.shortcutMatchesAllowlist({key: "F2"}, [], "mac"),
			false
		);
	} finally {
		await cleanup();
	}
});
