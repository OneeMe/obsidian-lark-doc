import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {pathToFileURL} from "node:url";
import esbuild from "esbuild";

async function loadBridgeModule() {
	const tempRoot = process.env.NODE_V8_COVERAGE ? process.cwd() : tmpdir();
	const tempDir = await mkdtemp(join(tempRoot, "obsidian-lark-electron-bridge-test-"));
	const outfile = join(tempDir, "electron-shortcut-bridge.mjs");

	await esbuild.build({
		entryPoints: ["src/electron-shortcut-bridge.ts"],
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

function createElectronBridge({throwOnSend = false, removeWithOff = true, includeFocus = true} = {}) {
	const listeners = [];
	const removed = [];
	const sent = [];
	let focusCount = 0;
	const child = {
		on: (_event, listener) => {
			listeners.push(listener);
		},
	};
	if (removeWithOff) {
		child.off = (_event, listener) => {
			removed.push(listener);
		};
	} else {
		child.removeListener = (_event, listener) => {
			removed.push(listener);
		};
	}

	const host = {
		sendInputEvent: (input) => {
			if (throwOnSend) throw new Error("send failed");
			sent.push(input);
		},
	};

	const currentWindow = {
		webContents: host,
	};
	if (includeFocus) {
		currentWindow.focus = () => {
			focusCount += 1;
		};
	}

	return {
		child,
		host,
		listeners,
		removed,
		sent,
		electron: {
			webContents: {
				fromId: (id) => id === 7 ? child : null,
			},
			getCurrentWindow: () => currentWindow,
		},
		get focusCount() {
			return focusCount;
		},
		webview: {
			getWebContentsId: () => 7,
		},
	};
}

test("electron shortcut bridge forwards matching keydown before preventing WebView input", async () => {
	const {module, cleanup} = await loadBridgeModule();
	try {
		const bridge = createElectronBridge();
		const installation = module.installWebviewShortcutForwarding(bridge.webview, {
			electron: bridge.electron,
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});

			assert.equal(installation.installed, true);
			assert.equal(bridge.listeners.length, 1);

			let prevented = false;
			const input = {type: "keyDown", key: "w", meta: true};
			bridge.listeners[0]({preventDefault: () => { prevented = true; }}, input);
			let keyUpPrevented = false;
			bridge.listeners[0]({preventDefault: () => { keyUpPrevented = true; }}, {
				type: "keyUp",
				key: "w",
				meta: true,
			});

			assert.deepEqual(bridge.sent, [
				{
					type: "keyDown",
					keyCode: "W",
					modifiers: ["meta"],
				},
				{
					type: "keyUp",
					keyCode: "W",
					modifiers: ["meta"],
				},
			]);
			assert.equal(prevented, true);
			assert.equal(keyUpPrevented, true);
			assert.equal(bridge.focusCount, 2);

		installation.dispose();
		assert.deepEqual(bridge.removed, [bridge.listeners[0]]);
	} finally {
		await cleanup();
	}
});

test("electron shortcut bridge leaves unmatched and failed forwards in the WebView", async () => {
	const {module, cleanup} = await loadBridgeModule();
	try {
		const bridge = createElectronBridge({throwOnSend: true, removeWithOff: false});
		const installation = module.installWebviewShortcutForwarding(bridge.webview, {
			electron: bridge.electron,
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});

		let unmatchedPrevented = false;
		bridge.listeners[0]({preventDefault: () => { unmatchedPrevented = true; }}, {
			type: "keyDown",
			key: "b",
			meta: true,
		});
		assert.equal(unmatchedPrevented, false);

			let failedPrevented = false;
			bridge.listeners[0]({preventDefault: () => { failedPrevented = true; }}, {
				type: "keyDown",
				key: "w",
				meta: true,
			});
			assert.equal(failedPrevented, false);

			bridge.listeners[0]({preventDefault: () => { throw new Error("should not run"); }}, {
				type: "keyUp",
				key: "b",
				meta: true,
			});

		installation.dispose();
		assert.deepEqual(bridge.removed, [bridge.listeners[0]]);
	} finally {
		await cleanup();
	}
});

test("electron shortcut bridge forwards code-only keys without requiring host focus", async () => {
	const {module, cleanup} = await loadBridgeModule();
	try {
		const bridge = createElectronBridge({includeFocus: false});
		const installation = module.installWebviewShortcutForwarding(bridge.webview, {
			electron: bridge.electron,
			getAllowlist: () => ["Mod+Alt+Shift+K", "F2", "Mod+Enter", "Alt+1"],
			platform: "other",
		});

		bridge.listeners[0]({preventDefault: () => undefined}, {
			type: "keyDown",
			code: "KeyK",
			modifiers: ["control", "alt", "shift"],
		});
		bridge.listeners[0]({preventDefault: () => undefined}, {
			type: "keyDown",
			code: "F2",
		});
		bridge.listeners[0]({preventDefault: () => undefined}, {
			type: "keyDown",
			key: "Enter",
			control: true,
		});
		bridge.listeners[0]({preventDefault: () => undefined}, {
			type: "keyDown",
			code: "Digit1",
			alt: true,
		});

		assert.deepEqual(bridge.sent, [
			{
				type: "keyDown",
				keyCode: "K",
				modifiers: ["shift", "control", "alt"],
			},
			{
				type: "keyDown",
				keyCode: "F2",
				modifiers: [],
			},
			{
				type: "keyDown",
				keyCode: "Enter",
				modifiers: ["control"],
			},
			{
				type: "keyDown",
				keyCode: "1",
				modifiers: ["alt"],
			},
		]);
		assert.equal(bridge.focusCount, 0);
		installation.dispose();
	} finally {
		await cleanup();
	}
});

test("electron shortcut bridge safely skips missing bridge capabilities", async () => {
	const {module, cleanup} = await loadBridgeModule();
	try {
		const nonObjectBridge = module.installWebviewShortcutForwarding({}, {
			electron: null,
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(nonObjectBridge.installed, false);
		nonObjectBridge.dispose();

		const missingBridge = module.installWebviewShortcutForwarding({}, {
			electron: {},
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(missingBridge.installed, false);
		missingBridge.dispose();

		const bridge = createElectronBridge();
		const missingChild = module.installWebviewShortcutForwarding({getWebContentsId: () => 8}, {
			electron: bridge.electron,
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(missingChild.installed, false);
		missingChild.dispose();

		const missingHostSend = module.installWebviewShortcutForwarding(bridge.webview, {
			electron: {
				webContents: {fromId: () => bridge.child},
				getCurrentWindow: () => ({webContents: {}}),
			},
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(missingHostSend.installed, false);
	} finally {
		await cleanup();
	}
});

test("electron shortcut bridge resolves global and remote Electron bridges", async () => {
	const {module, cleanup} = await loadBridgeModule();
	const previousRequire = globalThis.require;
	const previousElectron = globalThis.electron;
	try {
		const remoteBridge = createElectronBridge();
		globalThis.require = () => ({
			remote: {
				webContents: {
					fromId: () => remoteBridge.child,
				},
				getCurrentWindow: () => ({webContents: remoteBridge.host}),
			},
		});
		const remoteInstallation = module.installWebviewShortcutForwarding(remoteBridge.webview, {
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(remoteInstallation.installed, true);
		remoteInstallation.dispose();

		const fallbackBridge = createElectronBridge();
		globalThis.require = () => {
			throw new Error("require unavailable");
		};
		globalThis.electron = fallbackBridge.electron;
		const fallbackInstallation = module.installWebviewShortcutForwarding(fallbackBridge.webview, {
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(fallbackInstallation.installed, true);
		fallbackInstallation.dispose();

		delete globalThis.require;
		const noRequireInstallation = module.installWebviewShortcutForwarding(fallbackBridge.webview, {
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});
		assert.equal(noRequireInstallation.installed, true);
		noRequireInstallation.dispose();
	} finally {
		if (previousRequire === undefined) {
			delete globalThis.require;
		} else {
			globalThis.require = previousRequire;
		}
		if (previousElectron === undefined) {
			delete globalThis.electron;
		} else {
			globalThis.electron = previousElectron;
		}
		await cleanup();
	}
});
