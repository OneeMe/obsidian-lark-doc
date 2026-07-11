import {
	shortcutMatchesAllowlist,
	type ShortcutInputLike,
	type ShortcutPlatform,
} from "./shortcut-routing";

export interface ShortcutForwardingOptions {
	getAllowlist: () => readonly string[];
	platform: ShortcutPlatform;
	electron?: unknown;
}

export interface ShortcutForwardingInstallation {
	installed: boolean;
	dispose: () => void;
}

export interface WebviewShortcutElement {
	getWebContentsId?: () => number;
}

interface ElectronInputEvent {
	preventDefault?: () => void;
}

interface ElectronBeforeInput extends ShortcutInputLike {
	type?: string;
	isAutoRepeat?: boolean;
}

interface HostInputEvent {
	type: string;
	keyCode: string;
	modifiers: string[];
}

type BeforeInputListener = (event: ElectronInputEvent, input: ElectronBeforeInput) => void;

interface ChildWebContentsLike {
	on(event: "before-input-event", listener: BeforeInputListener): void;
	off?(event: "before-input-event", listener: BeforeInputListener): void;
	removeListener?(event: "before-input-event", listener: BeforeInputListener): void;
}

interface HostShortcutTarget {
	focus?: () => void;
	sendInputEvent(input: HostInputEvent): void;
}

interface ElectronBridge {
	webContentsFromId?: (id: number) => unknown;
	getCurrentWindow?: () => unknown;
}

const noop = () => undefined;

export function installWebviewShortcutForwarding(
	webview: WebviewShortcutElement,
	options: ShortcutForwardingOptions
): ShortcutForwardingInstallation {
	const bridge = resolveElectronBridge(options.electron ?? loadElectronBridge());
	const childContents = resolveChildWebContents(webview, bridge);
	const hostContents = resolveHostShortcutTarget(bridge);

	if (!childContents || !hostContents) {
		return {installed: false, dispose: noop};
	}

	const listener: BeforeInputListener = (event, input) => {
		const inputType = input.type;
		if (inputType !== "keyDown" && inputType !== "keyUp") return;
		if (!shortcutMatchesAllowlist(input, options.getAllowlist(), options.platform)) return;

		try {
			hostContents.focus?.();
			hostContents.sendInputEvent(toHostInputEvent(input, inputType));
			event.preventDefault?.();
		} catch {
			// Keep the original WebView input when forwarding fails.
		}
	};

	childContents.on("before-input-event", listener);

	return {
		installed: true,
		dispose: () => {
			if (childContents.off) {
				childContents.off("before-input-event", listener);
			} else {
				childContents.removeListener?.("before-input-event", listener);
			}
		},
	};
}

function resolveChildWebContents(
	webview: WebviewShortcutElement,
	bridge: ElectronBridge
): ChildWebContentsLike | null {
	const id = webview.getWebContentsId?.();
	if (typeof id !== "number" || !bridge.webContentsFromId) return null;
	return asChildWebContents(bridge.webContentsFromId(id));
}

function resolveHostShortcutTarget(bridge: ElectronBridge): HostShortcutTarget | null {
	const windowLike = bridge.getCurrentWindow?.();
	if (!isRecord(windowLike)) return null;
	return asHostShortcutTarget(windowLike);
}

function resolveElectronBridge(electron: unknown): ElectronBridge {
	if (!isRecord(electron)) return {};

	const webContentsModule = isRecord(electron.webContents) ? electron.webContents : undefined;
	const remoteModule = isRecord(electron.remote) ? electron.remote : undefined;
	const remoteWebContents = isRecord(remoteModule?.webContents) ? remoteModule.webContents : undefined;

	return {
		webContentsFromId: asFromId(webContentsModule?.fromId) ?? asFromId(remoteWebContents?.fromId),
		getCurrentWindow: asGetCurrentWindow(electron.getCurrentWindow) ?? asGetCurrentWindow(remoteModule?.getCurrentWindow),
	};
}

function toHostInputEvent(input: ElectronBeforeInput, type: "keyDown" | "keyUp"): HostInputEvent {
	return {
		type,
		keyCode: normalizeKeyCode(input),
		modifiers: readModifiers(input),
	};
}

function normalizeKeyCode(input: ElectronBeforeInput): string {
	const key = input.key;
	if (typeof key === "string" && key.length === 1) return key.toUpperCase();
	if (typeof key === "string" && key.length > 0) return key;
	if (typeof input.code === "string" && /^Key[A-Z]$/.test(input.code)) return input.code.slice(3);
	if (typeof input.code === "string" && /^Digit\d$/.test(input.code)) return input.code.slice(5);
	return input.code as string;
}

function readModifiers(input: ElectronBeforeInput): string[] {
	const modifiers: string[] = [];
	if (hasModifier(input, "shift")) modifiers.push("shift");
	if (hasModifier(input, "control")) modifiers.push("control");
	if (hasModifier(input, "alt")) modifiers.push("alt");
	if (hasModifier(input, "meta")) modifiers.push("meta");
	return modifiers;
}

function hasModifier(input: ElectronBeforeInput, modifier: "shift" | "control" | "alt" | "meta"): boolean {
	const source = new Set((input.modifiers ?? []).map((item) => item.toLowerCase()));
	if (modifier === "shift") return input.shift === true || input.shiftKey === true || source.has("shift");
	if (modifier === "control") return input.control === true || input.ctrlKey === true || source.has("control") || source.has("ctrl");
	if (modifier === "alt") return input.alt === true || input.altKey === true || source.has("alt") || source.has("option");
	return input.meta === true || input.metaKey === true || source.has("meta") || source.has("command");
}

function loadElectronBridge(): unknown {
	const runtime = globalThis as typeof globalThis & {
		require?: (moduleName: string) => unknown;
		electron?: unknown;
	};

	if (runtime.require) {
		try {
			return runtime.require("electron");
		} catch {
			return runtime.electron;
		}
	}

	return runtime.electron;
}

function asChildWebContents(value: unknown): ChildWebContentsLike | null {
	if (!isRecord(value) || typeof value.on !== "function") return null;
	return value as unknown as ChildWebContentsLike;
}

function asHostShortcutTarget(value: Record<string, unknown>): HostShortcutTarget | null {
	const webContents = value.webContents;
	if (!isRecord(webContents) || typeof webContents.sendInputEvent !== "function") return null;
	return {
		focus: typeof value.focus === "function" ? value.focus.bind(value) as () => void : undefined,
		sendInputEvent: webContents.sendInputEvent.bind(webContents) as (input: HostInputEvent) => void,
	};
}

function asFromId(value: unknown): ((id: number) => unknown) | undefined {
	return typeof value === "function" ? (value as (id: number) => unknown) : undefined;
}

function asGetCurrentWindow(value: unknown): (() => unknown) | undefined {
	return typeof value === "function" ? (value as () => unknown) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
