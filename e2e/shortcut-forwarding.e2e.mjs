import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {cp, mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const appPath = process.env.OBSIDIAN_APP_PATH ?? "/Applications/Obsidian.app";
const expectedVersion = process.env.OBSIDIAN_EXPECTED_VERSION;
const contractOnly = process.env.OBSIDIAN_CONTRACT_ONLY === "1";

async function runObsidianShortcutE2E() {
	const tempRoot = await mkdtemp(join(tmpdir(), "obsidian-lark-e2e-"));
	const userDataDir = join(tempRoot, "user-data");
	const vaultDir = join(tempRoot, "Shortcut Vault");
	const obsidianDir = join(vaultDir, ".obsidian");
	const pluginDir = join(obsidianDir, "plugins", "lark-doc");
	const targetPagePath = join(vaultDir, "webview-target.html");
	const targetPageUrl = pathToFileURLString(targetPagePath);
	const notePath = "Shortcut Target.lark.md";
	const port = 26000 + Math.floor(Math.random() * 1000);
	let browserClient;

	try {
		await mkdir(pluginDir, {recursive: true});
		await cp(resolve("main.js"), join(pluginDir, "main.js"));
		await cp(resolve("manifest.json"), join(pluginDir, "manifest.json"));
		await cp(resolve("styles.css"), join(pluginDir, "styles.css"));
		await mkdir(userDataDir, {recursive: true});
		await writeFile(join(userDataDir, "obsidian.json"), JSON.stringify({
			vaults: {
				"shortcut-e2e": {
					path: vaultDir,
					ts: Date.now(),
					open: true,
				},
			},
		}));
		await writeFile(join(obsidianDir, "community-plugins.json"), JSON.stringify(["lark-doc"]));
		await writeFile(targetPagePath, createTargetPageHtml());
		await writeFile(join(vaultDir, notePath), [
			"---",
			"lark_doc_id: shortcut-target",
			`lark_url: ${targetPageUrl}`,
			"lark_title: Shortcut target",
			"---",
			"",
		].join("\n"));

		execFileSync("open", [
			"-na",
			appPath,
			"--args",
			`--remote-debugging-port=${port}`,
			`--user-data-dir=${userDataDir}`,
		]);

			const browserWsUrl = await waitForBrowserWebSocket(port);
			browserClient = await CdpClient.connect(browserWsUrl);

			const appTarget = await waitForTarget(browserClient, (target) => {
				return target.type === "page" && target.url.startsWith("app://obsidian.md/");
			});
			const appClient = await CdpClient.connect(targetWebSocketUrl(port, appTarget.targetId));
			try {
				await appClient.send("Runtime.enable");
				await waitForRuntime(appClient, "globalThis.app?.vault && globalThis.app?.workspace");
				await waitForRuntime(appClient, `globalThis.app.vault.getAbstractFileByPath(${JSON.stringify(notePath)})`);
				await installHostInputRecorder(appClient);
				await evaluate(appClient, `
					await app.plugins.loadManifests?.();
					const pluginPrototypeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(app.plugins));
					await app.plugins.setEnable?.("lark-doc", true);
					let loadResult;
				let loadError = null;
				try {
					loadResult = await app.plugins.loadPlugin?.("lark-doc");
				} catch (err) {
					loadError = err instanceof Error ? err.stack : String(err);
				}
				let enableResult;
				let enableError = null;
				try {
					enableResult = await (app.plugins.enablePlugin?.("lark-doc") ?? app.plugins.enablePluginAndSave?.("lark-doc"));
				} catch (err) {
					enableError = err instanceof Error ? err.stack : String(err);
				}
				window.__obsidianLarkE2ELoadState = {
					pluginPrototypeMethods,
					loadResult: Boolean(loadResult),
					loadError,
					enableResult: Boolean(enableResult),
					enableError,
					isEnabled: app.plugins.isEnabled?.("lark-doc"),
					pluginFolder: app.plugins.getPluginFolder?.(),
					manifest: app.plugins.manifests["lark-doc"],
				};
			`);
			try {
				await waitForRuntime(appClient, `globalThis.app.plugins.getPlugin?.("lark-doc")`);
			} catch (err) {
				const loadState = await evaluate(appClient, "return window.__obsidianLarkE2ELoadState;");
				console.error(`Plugin load state: ${JSON.stringify(loadState, null, 2)}`);
				throw err;
			}
			const appState = await evaluate(appClient, `
				const file = app.vault.getAbstractFileByPath(${JSON.stringify(notePath)});
				if (!file) throw new Error("Missing E2E note");
				await app.workspace.getLeaf(true).openFile(file);
				const leafTypes = [];
				app.workspace.iterateAllLeaves((leaf) => leafTypes.push(leaf.getViewState().type));
				return {
					pluginEnabled: Boolean(app.plugins.getPlugin?.("lark-doc")),
					manifestLoaded: Boolean(app.plugins.manifests["lark-doc"]),
					manifestIds: Object.keys(app.plugins.manifests).filter((id) => id.includes("lark") || id.includes("doc")),
					pluginMethods: Object.keys(app.plugins).filter((key) => key.toLowerCase().includes("manifest") || key.toLowerCase().includes("plugin")),
					pluginPrototypeMethods: window.__obsidianLarkE2ELoadState.pluginPrototypeMethods,
					loadResult: window.__obsidianLarkE2ELoadState.loadResult,
					enabledPluginIds: Array.from(app.plugins.enabledPlugins ?? []),
					feishuLeaves: app.workspace.getLeavesOfType("feishu-doc-view").length,
					leafTypes,
				};
			`);
			console.log(`Obsidian app state: ${JSON.stringify(appState)}`);
			} finally {
				appClient.close();
			}

			let webviewTarget;
			try {
				webviewTarget = await waitForTarget(browserClient, (target) => {
					return target.type === "webview" && target.url.endsWith("/webview-target.html");
				}, 60000);
			} catch (err) {
				const targets = await listTargets(browserClient).catch(() => []);
				console.error(`Available CDP targets: ${JSON.stringify(targets, null, 2)}`);
				throw err;
			}
			const webviewClient = await browserClient.attachToTarget(webviewTarget.targetId);
			const inputClient = await CdpClient.connect(targetWebSocketUrl(port, appTarget.targetId));
			try {
				await inputClient.send("Runtime.enable");
				await webviewClient.send("Runtime.enable");
				await waitForRuntime(webviewClient, "document.readyState === 'complete'");
				await evaluate(webviewClient, "document.body.focus(); window.__shortcutCounts = {};");
				await evaluate(inputClient, `document.querySelector("webview")?.focus();`);

				await sendElectronShortcut(inputClient, "b");
				await delay(500);
				assert.deepEqual(await getHostInputs(inputClient), []);

				await sendElectronShortcut(inputClient, "w", ["meta"]);
				await waitFor(async () => {
					const hostInputs = await getHostInputs(inputClient);
					return hostInputs.some((input) => input.type === "keyDown" && input.keyCode === "W") ? true : null;
				}, {
					timeoutMs: 5000,
					message: "Expected Cmd+W to be forwarded to Obsidian.",
				});
				assert.deepEqual(
					(await getHostInputs(inputClient)).map((input) => `${input.type}:${input.keyCode}`),
					["keyDown:W", "keyUp:W"]
				);
			} finally {
				inputClient.close();
				await webviewClient.close();
			}

			console.log("Obsidian shortcut forwarding E2E passed.");
	} finally {
		if (browserClient) {
			try {
				await browserClient.send("Browser.close");
			} catch {
				// Obsidian may already be closed by the shortcut under test.
			}
			browserClient.close();
		}
		await rm(tempRoot, {recursive: true, force: true});
	}
}

async function runContractCheck() {
	const {module, cleanup} = await loadBridgeModule();
	try {
		const listeners = [];
		const sent = [];
		const child = {
			on: (_event, listener) => listeners.push(listener),
			off: () => undefined,
		};
		const host = {
			sendInputEvent: (input) => sent.push(input),
		};
		const installation = module.installWebviewShortcutForwarding({
			getWebContentsId: () => 1,
		}, {
			electron: {
				webContents: {fromId: () => child},
				getCurrentWindow: () => ({webContents: host}),
			},
			getAllowlist: () => ["Mod+W"],
			platform: "mac",
		});

		assert.equal(installation.installed, true);
		let nonAllowlistedPrevented = false;
		listeners[0]({preventDefault: () => { nonAllowlistedPrevented = true; }}, {
			type: "keyDown",
			key: "b",
			meta: true,
		});
		assert.equal(nonAllowlistedPrevented, false);
		assert.equal(sent.length, 0);

		let allowlistedPrevented = false;
		listeners[0]({preventDefault: () => { allowlistedPrevented = true; }}, {
			type: "keyDown",
			key: "w",
			meta: true,
		});
		assert.equal(allowlistedPrevented, true);
			assert.deepEqual(sent.map((input) => input.keyCode), ["W"]);

		installation.dispose();
		console.log("Shortcut forwarding contract passed.");
	} finally {
		await cleanup();
	}
}

function readObsidianVersion(path) {
	return execFileSync("/usr/libexec/PlistBuddy", [
		"-c",
		"Print :CFBundleShortVersionString",
		join(path, "Contents", "Info.plist"),
	], {encoding: "utf8"}).trim();
}

async function waitForBrowserWebSocket(port) {
	const versionUrl = `http://127.0.0.1:${port}/json/version`;
	const result = await waitFor(async () => {
		const response = await fetch(versionUrl).catch(() => null);
		if (!response?.ok) return null;
		const data = await response.json();
		return typeof data.webSocketDebuggerUrl === "string" ? data.webSocketDebuggerUrl : null;
	}, {
		timeoutMs: 30000,
		message: "Timed out waiting for Obsidian remote debugging.",
	});
	return result;
}

async function listTargets(client) {
	const response = await client.send("Target.getTargets");
	return response.targetInfos ?? [];
}

async function waitForTarget(client, predicate, timeoutMs = 30000) {
	return waitFor(async () => {
		const targets = await listTargets(client).catch(() => []);
		return targets.find(predicate) ?? null;
	}, {
		timeoutMs,
		message: "Timed out waiting for Obsidian CDP target.",
	});
}

function targetWebSocketUrl(port, targetId) {
	return `ws://127.0.0.1:${port}/devtools/page/${targetId}`;
}

async function waitForRuntime(client, expression) {
	await waitFor(async () => {
		const result = await client.send("Runtime.evaluate", {
			expression: `Boolean(${expression})`,
			awaitPromise: true,
			returnByValue: true,
		}).catch(() => null);
		return result?.result?.value === true ? true : null;
	}, {
		timeoutMs: 30000,
		message: `Timed out waiting for runtime expression: ${expression}`,
	});
}

async function evaluate(client, body) {
	const response = await client.send("Runtime.evaluate", {
		expression: `(async () => { ${body} })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	if (response.exceptionDetails) {
		throw new Error(response.exceptionDetails.text ?? "Runtime evaluation failed.");
	}
	return response.result?.value;
}

async function installHostInputRecorder(client) {
	await evaluate(client, `
		window.__obsidianLarkE2EHostInputs = [];
		const electron = globalThis.require?.("electron") ?? globalThis.electron;
		const currentWindow = electron?.remote?.getCurrentWindow?.() ?? electron?.getCurrentWindow?.();
		const webContents = currentWindow?.webContents;
		if (!webContents?.sendInputEvent) {
			throw new Error("Could not resolve host webContents for shortcut E2E.");
		}
		if (!webContents.__obsidianLarkE2EPatched) {
			const originalSendInputEvent = webContents.sendInputEvent.bind(webContents);
			webContents.sendInputEvent = (input) => {
				window.__obsidianLarkE2EHostInputs.push({
					type: input?.type,
					keyCode: input?.keyCode,
					modifiers: Array.from(input?.modifiers ?? []),
				});
				return originalSendInputEvent(input);
			};
			webContents.__obsidianLarkE2EPatched = true;
		}
	`);
}

async function getHostInputs(client) {
	return evaluate(client, "return window.__obsidianLarkE2EHostInputs ?? [];");
}

function delay(ms) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function sendElectronShortcut(client, key, modifiers = []) {
	const keyCode = key.toUpperCase();
	await evaluate(client, `
		const electron = globalThis.require?.("electron") ?? globalThis.electron;
		const webview = document.querySelector("webview");
		const webContentsId = webview?.getWebContentsId?.();
		const webContentsApi = electron?.webContents ?? electron?.remote?.webContents;
		const webContents = webContentsApi?.fromId?.(webContentsId);
		if (!webContents?.sendInputEvent) {
			throw new Error(JSON.stringify({
				hasRequire: typeof globalThis.require === "function",
				electronKeys: Object.keys(electron ?? {}),
				remoteKeys: Object.keys(electron?.remote ?? {}),
				hasWebview: Boolean(webview),
				webContentsId,
			}));
		}
		const event = {
			keyCode: ${JSON.stringify(keyCode)},
			modifiers: ${JSON.stringify(modifiers)},
		};
		webContents.sendInputEvent({...event, type: "keyDown"});
		if (event.modifiers.length === 0) {
			webContents.sendInputEvent({type: "char", keyCode: ${JSON.stringify(key.toLowerCase())}});
		}
		webContents.sendInputEvent({...event, type: "keyUp"});
	`);
}

async function waitFor(producer, options) {
	const startedAt = Date.now();
	let lastError;
	while (Date.now() - startedAt < options.timeoutMs) {
		try {
			const value = await producer();
			if (value) return value;
		} catch (err) {
			lastError = err;
		}
		await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
	}
	if (lastError instanceof Error) {
		throw new Error(`${options.message} Last error: ${lastError.message}`);
	}
	throw new Error(options.message);
}

async function loadBridgeModule() {
	const tempDir = await mkdtemp(join(tmpdir(), "obsidian-lark-shortcut-e2e-"));
	const outfile = join(tempDir, "bridge.mjs");
	const esbuild = await import("esbuild");
	await esbuild.default.build({
		entryPoints: ["src/electron-shortcut-bridge.ts"],
		bundle: true,
		format: "esm",
		platform: "node",
		sourcemap: "inline",
		sourcesContent: true,
		outfile,
	});
	const imported = await import(pathToFileURLString(outfile));
	return {
		module: imported,
		cleanup: () => rm(tempDir, {recursive: true, force: true}),
	};
}

function createTargetPageHtml() {
	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8">
	<title>Shortcut target</title>
</head>
<body tabindex="0">
	<script>
		window.__shortcutCounts = {};
		document.body.focus();
		document.addEventListener("keydown", (event) => {
			const key = String(event.key || "").toLowerCase();
			window.__shortcutCounts[key] = (window.__shortcutCounts[key] || 0) + 1;
			document.body.dataset.lastKey = key;
		});
	</script>
</body>
</html>`;
}

function pathToFileURLString(path) {
	const resolvedPath = resolve(path);
	const prefix = process.platform === "win32" ? "/" : "";
	return `file://${prefix}${resolvedPath.split(/[\\/]/).map(encodeURIComponent).join("/")}`;
}

class CdpClient {
	static async connect(url) {
		const socket = new WebSocket(url);
		const client = new CdpClient(socket);
		await new Promise((resolvePromise, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Timed out connecting to CDP target: ${url}`));
			}, 10000);
			socket.addEventListener("open", () => {
				clearTimeout(timeout);
				resolvePromise();
			}, {once: true});
			socket.addEventListener("error", (event) => {
				clearTimeout(timeout);
				reject(event.error ?? new Error(`Could not connect to CDP target: ${url}`));
			}, {once: true});
		});
		return client;
	}

	constructor(socket) {
		this.socket = socket;
		this.nextId = 1;
		this.pending = new Map();
		socket.addEventListener("message", (event) => {
			const payload = JSON.parse(event.data);
			if (!payload.id) return;
			const pending = this.pending.get(payload.id);
			if (!pending) return;
			this.pending.delete(payload.id);
			if (payload.error) {
				pending.reject(new Error(payload.error.message));
			} else {
				pending.resolve(payload.result ?? {});
			}
		});
		socket.addEventListener("close", () => {
			for (const pending of this.pending.values()) {
				pending.reject(new Error("CDP socket closed."));
			}
			this.pending.clear();
		});
	}

	async attachToTarget(targetId) {
		const response = await this.send("Target.attachToTarget", {
			targetId,
			flatten: true,
		});
		return new CdpSession(this, response.sessionId);
	}

	send(method, params = {}, sessionId = undefined) {
		const id = this.nextId++;
		const message = JSON.stringify(sessionId ? {id, method, params, sessionId} : {id, method, params});
		return new Promise((resolvePromise, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timed out waiting for CDP response: ${method}`));
			}, 10000);
			this.pending.set(id, {
				resolve: (result) => {
					clearTimeout(timeout);
					resolvePromise(result);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});
			try {
				this.socket.send(message);
			} catch (error) {
				clearTimeout(timeout);
				this.pending.delete(id);
				reject(error);
			}
		});
	}

	close() {
		this.socket.close();
	}
}

class CdpSession {
	constructor(client, sessionId) {
		this.client = client;
		this.sessionId = sessionId;
		this.closed = false;
	}

	send(method, params = {}) {
		return this.client.send(method, params, this.sessionId);
	}

	async close() {
		if (this.closed) return;
		this.closed = true;
		await this.client.send("Target.detachFromTarget", {
			sessionId: this.sessionId,
		}).catch(() => undefined);
	}
}

if (process.platform !== "darwin" || !existsSync(appPath)) {
	if (expectedVersion) {
		throw new Error(`Expected Obsidian ${expectedVersion}, but ${appPath} was not found.`);
	}
	console.log("Obsidian app not found; running shortcut forwarding contract checks only.");
	await runContractCheck();
} else {
	const version = readObsidianVersion(appPath);
	if (expectedVersion) {
		assert.equal(version, expectedVersion);
	}
	console.log(`Verified Obsidian ${version} at ${appPath}`);

	if (contractOnly) {
		await runContractCheck();
	} else {
		await runObsidianShortcutE2E();
	}
}
