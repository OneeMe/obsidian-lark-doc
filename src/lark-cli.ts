import {spawn} from "child_process";
import {delimiter, dirname} from "path";
import {isFeishuBaseUrl, type FeishuDocInfo} from "./types";
import type {TranslationKey, TranslationVars, Translator} from "./i18n";
import {getEffectiveLarkCliPath} from "./lark-cli-resolver";

export class LarkCliError extends Error {
	translationKey: TranslationKey | undefined;
	translationVars: TranslationVars | undefined;

	constructor(
		message: string,
		translation?: {key: TranslationKey; vars?: TranslationVars}
	) {
		super(message);
		this.name = "LarkCliError";
		this.translationKey = translation?.key;
		this.translationVars = translation?.vars;
	}
}

interface TranslatableError {
	translationKey?: TranslationKey;
	translationVars?: TranslationVars;
}

function runCommand(
	cliPath: string,
	args: string[]
): Promise<{stdout: string; stderr: string}> {
	return new Promise((resolve, reject) => {
		const env = buildCommandEnv(cliPath);
		const proc = spawn(cliPath, args, env ? {shell: false, env} : {shell: false});
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data: unknown) => {
			stdout += String(data);
		});

		proc.stderr.on("data", (data: unknown) => {
			stderr += String(data);
		});

		proc.on("error", (err) => {
			reject(createSpawnError(cliPath, err));
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new LarkCliError(stderr || `Lark CLI exited with code ${code}`));
			} else {
				resolve({stdout, stderr});
			}
		});
	});
}

export function formatLarkCliError(err: unknown, translate: Translator): string {
	if (isTranslatableError(err)) {
		return translate(err.translationKey, err.translationVars);
	}
	return err instanceof Error ? err.message : String(err);
}

function isTranslatableError(err: unknown): err is TranslatableError & {translationKey: TranslationKey} {
	return typeof (err as TranslatableError | null)?.translationKey === "string";
}

function createSpawnError(cliPath: string, err: Error & {code?: string}): LarkCliError {
	if (err.code !== "ENOENT") {
		return new LarkCliError(`Failed to spawn Lark CLI: ${err.message}`);
	}

	return new LarkCliError(
		[
			`Lark CLI was not found. Current value: ${cliPath}.`,
			"Obsidian may not inherit your terminal PATH.",
			"Set an absolute path to Lark CLI in plugin settings.",
		].join(" "),
		{
			key: "error.larkCliNotFound",
			vars: {cliPath},
		}
	);
}

function buildCommandEnv(cliPath: string): Record<string, string | undefined> | undefined {
	const cliDir = dirname(cliPath);
	if (!cliDir || cliDir === ".") return undefined;

	const currentPath = process.env.PATH;
	return {
		...process.env,
		PATH: currentPath ? `${cliDir}${delimiter}${currentPath}` : cliDir,
	};
}

/**
 * Create a new Feishu wiki node via Lark CLI.
 * Creates in the user's personal wiki library by default.
 */
export async function createFeishuDocument(
	cliPath: string,
	title: string,
	tenantDomain: string,
	_content?: string
): Promise<FeishuDocInfo> {
	const resolvedPath = getEffectiveLarkCliPath(cliPath);

	const args = [
		"wiki", "+node-create",
		"--as", "user",
		"--title", title,
	];

	const {stdout} = await runCommand(resolvedPath, args);

	const parsed = parseCliJson(stdout);
	if (!parsed) {
		throw new LarkCliError("Could not parse Lark CLI output. Raw stdout:\n" + stdout);
	}

	if (parsed.error) {
		throw new LarkCliError(String((parsed.error as Record<string, string>).message || JSON.stringify(parsed.error)));
	}

	const nodeToken = extractString(parsed, ["data.node_token", "node_token"]);
	const resolvedTitle = extractString(parsed, ["data.title", "title"]) || title;
	const returnedUrl = extractString(parsed, ["data.url", "url"]);

	if (!nodeToken) {
		throw new LarkCliError("Failed to extract node_token from Lark CLI output: " + stdout);
	}

	const url = returnedUrl || `https://${tenantDomain}/wiki/${nodeToken}`;
	return {docId: nodeToken, url, title: resolvedTitle};
}

export async function createFeishuBase(
	cliPath: string,
	title: string,
	tenantDomain: string
): Promise<FeishuDocInfo> {
	const resolvedPath = getEffectiveLarkCliPath(cliPath);

	const args = [
		"base", "+base-create",
		"--as", "user",
		"--name", title,
	];

	const {stdout} = await runCommand(resolvedPath, args);

	const parsed = parseCliJson(stdout);
	if (!parsed) {
		throw new LarkCliError("Could not parse Lark CLI output. Raw stdout:\n" + stdout);
	}

	if (parsed.error) {
		throw new LarkCliError(String((parsed.error as Record<string, string>).message || JSON.stringify(parsed.error)));
	}

	const baseToken = extractString(parsed, [
		"data.base.base_token",
		"data.base.token",
		"data.base.app_token",
		"data.base.baseToken",
		"data.app.base_token",
		"data.app.token",
		"data.app.app_token",
		"data.base_token",
		"data.token",
		"data.app_token",
		"base.base_token",
		"base.token",
		"base.app_token",
		"base.baseToken",
		"base_token",
		"token",
		"app_token",
	]);
	const resolvedTitle = extractString(parsed, [
		"data.base.name",
		"data.base.title",
		"data.app.name",
		"data.name",
		"base.name",
		"base.title",
		"name",
		"title",
	]) || title;
	const returnedUrl = extractString(parsed, [
		"data.base.url",
		"data.app.url",
		"data.url",
		"base.url",
		"url",
	]);

	if (!baseToken) {
		throw new LarkCliError("Failed to extract base token from Lark CLI output: " + stdout);
	}

	const url = returnedUrl || `https://${tenantDomain}/base/${baseToken}`;
	return {docId: baseToken, url, title: resolvedTitle};
}

/**
 * Fetch the current title of a Feishu document.
 *
 * Supports both wiki node tokens (via wiki spaces get_node) and
 * legacy docx tokens (via docs +fetch).
 */
export async function fetchFeishuDocumentTitle(
	cliPath: string,
	docToken: string,
	url?: string
): Promise<string> {
	const resolvedPath = getEffectiveLarkCliPath(cliPath);

	if (url && isFeishuBaseUrl(url)) {
		return await fetchFeishuBaseTitle(resolvedPath, docToken);
	}

	// First, try wiki spaces get_node (for wiki node tokens)
	const wikiArgs = [
		"wiki", "spaces", "get_node",
		"--as", "user",
		"--params", JSON.stringify({token: docToken}),
		"--format", "json",
	];

	try {
		const {stdout: wikiStdout} = await runCommand(resolvedPath, wikiArgs);
		const parsed = parseCliJson(wikiStdout);
		if (parsed && !parsed.error) {
			const title = extractString(parsed, ["data.node.title", "node.title", "title"]);
			if (title) return title;
		}
	} catch {
		// Wiki lookup failed — fall through to docs fetch
	}

	// Fallback: docs +fetch (for legacy docx tokens)
	const docArgs = [
		"docs", "+fetch",
		"--as", "user",
		"--api-version", "v2",
		"--doc", docToken,
	];

	const {stdout} = await runCommand(resolvedPath, docArgs);

	// Try JSON first
	const parsed = parseCliJson(stdout);
	if (parsed) {
		if (parsed.error) {
			throw new LarkCliError(String((parsed.error as Record<string, string>).message || JSON.stringify(parsed.error)));
		}
		const title = extractString(parsed, ["document.title", "title"]);
		if (title) return title;
	}

	// Fallback: try to extract <title> from XML output
	const titleMatch = stdout.match(/<title>([^<]+)<\/title>/);
	if (titleMatch?.[1]) {
		return titleMatch[1];
	}

	return "";
}

async function fetchFeishuBaseTitle(
	resolvedPath: string,
	baseToken: string
): Promise<string> {
	const baseArgs = [
		"base", "+base-get",
		"--as", "user",
		"--base-token", baseToken,
	];
	const {stdout} = await runCommand(resolvedPath, baseArgs);
	const parsed = parseCliJson(stdout);

	if (parsed?.error) {
		throw new LarkCliError(String((parsed.error as Record<string, string>).message || JSON.stringify(parsed.error)));
	}

	return parsed
		? extractString(parsed, ["data.base.name", "base.name", "data.name", "name"]) ?? ""
		: "";
}

/**
 * Parse JSON from CLI stdout.
 * Handles both compact single-line JSON and pretty-printed multi-line JSON.
 */
function parseCliJson(stdout: string): Record<string, unknown> | undefined {
	const trimmed = stdout.trim();

	// Try the entire stdout first (handles multi-line formatted JSON)
	if (trimmed.startsWith("{")) {
		try {
			return JSON.parse(trimmed) as Record<string, unknown>;
		} catch {
			// not valid as a whole, try line-by-line
		}
	}

	// Fallback: scan line-by-line for JSON objects (handles mixed output)
	const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
	for (const line of lines) {
		if (line.startsWith("{")) {
			try {
				return JSON.parse(line) as Record<string, unknown>;
			} catch {
				// continue
			}
		}
	}

	return undefined;
}

function extractString(obj: Record<string, unknown>, paths: string[]): string | undefined {
	for (const path of paths) {
		const parts = path.split(".");
		let current: unknown = obj;
		for (const part of parts) {
			if (current && typeof current === "object" && part in current) {
				current = (current as Record<string, unknown>)[part];
			} else {
				current = undefined;
				break;
			}
		}
		if (typeof current === "string" && current.length > 0) {
			return current;
		}
	}
	return undefined;
}
