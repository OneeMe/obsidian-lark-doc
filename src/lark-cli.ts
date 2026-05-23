import {spawn} from "child_process";
import {delimiter, dirname} from "path";
import type {FeishuDocInfo} from "./types";
import {getEffectiveLarkCliPath} from "./lark-cli-resolver";

export class LarkCliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LarkCliError";
	}
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
			reject(new LarkCliError(`Failed to spawn Lark CLI: ${err.message}`));
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

/**
 * Fetch the current title of a Feishu document.
 *
 * Supports both wiki node tokens (via wiki spaces get_node) and
 * legacy docx tokens (via docs +fetch).
 */
export async function fetchFeishuDocumentTitle(
	cliPath: string,
	docToken: string
): Promise<string> {
	const resolvedPath = getEffectiveLarkCliPath(cliPath);

	// First, try wiki spaces get_node (for wiki node tokens)
	const wikiArgs = [
		"wiki", "spaces", "get_node",
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
