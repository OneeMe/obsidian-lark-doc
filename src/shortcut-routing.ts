export type ShortcutPlatform = "mac" | "other";

export interface ShortcutInputLike {
	key?: string;
	code?: string;
	metaKey?: boolean;
	ctrlKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
	meta?: boolean;
	control?: boolean;
	alt?: boolean;
	shift?: boolean;
	modifiers?: readonly string[];
}

export interface ShortcutRecordResult {
	type: "recorded" | "cancelled" | "invalid";
	shortcut?: string;
}

interface ParsedShortcut {
	mod: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
	key: string;
}

const MODIFIER_KEYS = new Set([
	"Alt",
	"AltGraph",
	"Control",
	"Ctrl",
	"Meta",
	"Mod",
	"Shift",
	"Command",
	"Cmd",
	"Super",
	"OS",
]);

const KEY_ALIASES: Record<string, string> = {
	" ": "Space",
	Esc: "Escape",
	Spacebar: "Space",
	Del: "Delete",
	Up: "ArrowUp",
	Down: "ArrowDown",
	Left: "ArrowLeft",
	Right: "ArrowRight",
	Plus: "+",
};

const CODE_KEY_ALIASES: Record<string, string> = {
	Space: "Space",
	Minus: "-",
	Equal: "=",
	BracketLeft: "[",
	BracketRight: "]",
	Backslash: "\\",
	Semicolon: ";",
	Quote: "'",
	Comma: ",",
	Period: ".",
	Slash: "/",
	Backquote: "`",
};

export const DEFAULT_SHORTCUT_ALLOWLIST = ["Mod+W"] as const;

export function recordShortcutFromKeyboardEvent(
	event: ShortcutInputLike,
	platform: ShortcutPlatform
): ShortcutRecordResult {
	if (normalizeKey(event.key, event.code) === "Escape") {
		return {type: "cancelled"};
	}

	const shortcut = shortcutFromInput(event, platform);
	if (!shortcut || !isRecordableShortcut(shortcut)) {
		return {type: "invalid"};
	}

	return {type: "recorded", shortcut};
}

export function shortcutFromInput(
	input: ShortcutInputLike,
	platform: ShortcutPlatform
): string | null {
	const key = normalizeKey(input.key, input.code);
	if (!key || MODIFIER_KEYS.has(key)) return null;

	const flags = readModifierFlags(input);
	const parsed: ParsedShortcut = {
		mod: platform === "mac" ? flags.meta : flags.ctrl,
		ctrl: platform === "mac" ? flags.ctrl : false,
		alt: flags.alt,
		shift: flags.shift,
		key,
	};

	return formatShortcut(parsed);
}

export function cleanShortcutAllowlist(
	value: unknown,
	fallback: readonly string[] = DEFAULT_SHORTCUT_ALLOWLIST
): string[] {
	const source = Array.isArray(value) ? value : fallback;
	return uniqueNormalizedShortcuts(source);
}

export function addShortcutToAllowlist(
	allowlist: readonly string[],
	shortcut: string
): string[] {
	return uniqueNormalizedShortcuts([...allowlist, shortcut]);
}

export function removeShortcutFromAllowlist(
	allowlist: readonly string[],
	shortcut: string
): string[] {
	const target = normalizeShortcutString(shortcut);
	return uniqueNormalizedShortcuts(allowlist).filter((item) => item !== target);
}

export function shortcutMatchesAllowlist(
	input: ShortcutInputLike,
	allowlist: readonly string[],
	platform: ShortcutPlatform
): boolean {
	if (allowlist.length === 0) return false;
	const shortcut = shortcutFromInput(input, platform);
	if (!shortcut) return false;

	const normalizedAllowlist = new Set(uniqueNormalizedShortcuts(allowlist));
	return normalizedAllowlist.has(shortcut);
}

export function normalizeShortcutString(value: string): string | null {
	const parsed = parseShortcutString(value, {rejectModifierKey: true});
	if (!parsed || !isRecordableParsedShortcut(parsed)) return null;
	const shortcut = formatShortcut(parsed);
	return parseShortcut(shortcut) ? shortcut : null;
}

export function isRecordableShortcut(shortcut: string): boolean {
	return normalizeShortcutString(shortcut) !== null;
}

function uniqueNormalizedShortcuts(values: readonly unknown[]): string[] {
	const seen = new Set<string>();
	const shortcuts: string[] = [];

	for (const value of values) {
		if (typeof value !== "string") continue;
		const shortcut = normalizeShortcutString(value);
		if (!shortcut || seen.has(shortcut)) continue;
		seen.add(shortcut);
		shortcuts.push(shortcut);
	}

	return shortcuts;
}

function parseShortcut(shortcut: string): ParsedShortcut | null {
	return parseShortcutString(shortcut, {rejectModifierKey: false});
}

function parseShortcutString(
	value: string,
	options: {rejectModifierKey: boolean}
): ParsedShortcut | null {
	const rawParts = value.split("+").map((part) => part.trim()).filter(Boolean);
	if (rawParts.length === 0) return null;

	let mod = false;
	let ctrl = false;
	let alt = false;
	let shift = false;
	let key: string | undefined;

	for (const rawPart of rawParts) {
		const part = normalizeToken(rawPart);
		if (part === "Mod") {
			mod = true;
		} else if (part === "Ctrl") {
			ctrl = true;
		} else if (part === "Alt") {
			alt = true;
		} else if (part === "Shift") {
			shift = true;
		} else {
			const normalizedKey = normalizeKey(part);
			if (!normalizedKey || key || (options.rejectModifierKey && MODIFIER_KEYS.has(normalizedKey))) {
				return null;
			}
			key = normalizedKey;
		}
	}

	return key ? {mod, ctrl, alt, shift, key} : null;
}

function isRecordableParsedShortcut(shortcut: ParsedShortcut): boolean {
	if (shortcut.key === "Escape") return false;
	return shortcut.mod || shortcut.ctrl || shortcut.alt || isFunctionKey(shortcut.key);
}

function formatShortcut(shortcut: ParsedShortcut): string {
	const parts: string[] = [];
	if (shortcut.mod) parts.push("Mod");
	if (shortcut.ctrl) parts.push("Ctrl");
	if (shortcut.alt) parts.push("Alt");
	if (shortcut.shift) parts.push("Shift");
	parts.push(shortcut.key);
	return parts.join("+");
}

function normalizeToken(value: string): string {
	const lower = value.toLowerCase();
	if (lower === "mod") return "Mod";
	if (lower === "cmd" || lower === "command" || lower === "meta") return "Mod";
	if (lower === "ctrl" || lower === "control" || lower === "ctl") return "Ctrl";
	if (lower === "alt" || lower === "option") return "Alt";
	if (lower === "shift") return "Shift";
	return value;
}

function normalizeKey(key: string | undefined, code?: string): string | null {
	if (key) {
		const aliased = KEY_ALIASES[key] ?? key;
		const functionKey = normalizeFunctionKey(aliased);
		if (functionKey) return functionKey;
		if (/^F\d{1,2}$/i.test(aliased)) return null;
		if (aliased.length === 1) return aliased.toUpperCase();
		return aliased;
	}

	if (!code) return null;
	if (/^Key[A-Z]$/.test(code)) return code.slice(3);
	if (/^Digit\d$/.test(code)) return code.slice(5);
	const functionKey = normalizeFunctionKey(code);
	if (functionKey) return functionKey;
	if (/^F\d{1,2}$/i.test(code)) return null;
	return CODE_KEY_ALIASES[code] ?? code;
}

function normalizeFunctionKey(value: string): string | null {
	const match = /^F(\d{1,2})$/i.exec(value);
	if (!match) return null;
	const number = Number(match[1]);
	return number >= 1 && number <= 24 ? `F${number}` : null;
}

function isFunctionKey(key: string): boolean {
	return normalizeFunctionKey(key) === key;
}

function readModifierFlags(input: ShortcutInputLike): {
	meta: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
} {
	const modifiers = new Set((input.modifiers ?? []).map((modifier) => modifier.toLowerCase()));
	return {
		meta: input.metaKey === true || input.meta === true || modifiers.has("meta") || modifiers.has("command"),
		ctrl: input.ctrlKey === true || input.control === true || modifiers.has("control") || modifiers.has("ctrl"),
		alt: input.altKey === true || input.alt === true || modifiers.has("alt") || modifiers.has("option"),
		shift: input.shiftKey === true || input.shift === true || modifiers.has("shift"),
	};
}
