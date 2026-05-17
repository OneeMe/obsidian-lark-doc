import {Notice} from "obsidian";
import {spawn} from "child_process";
import type {FeishuDocInfo} from "./types";
import {getEffectiveLarkCliPath, resolveUserShellPath} from "./lark-cli-resolver";

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
		// Inject user's shell PATH so node (and fnm/nvm) are discoverable
		const userPath = resolveUserShellPath();
		const env = userPath
			? {...process.env, PATH: userPath}
			: process.env;

		const proc = spawn(cliPath, args, {shell: false, env});
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
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

/**
 * Create a new Feishu document via Lark CLI.
 */
export async function createFeishuDocument(
	cliPath: string,
	title: string,
	content?: string
): Promise<FeishuDocInfo> {
	const resolvedPath = getEffectiveLarkCliPath(cliPath);
	const xmlContent = content
		? `<title>${escapeXml(title)}</title><p>${escapeXml(content)}</p>`
		: `<title>${escapeXml(title)}</title>`;

	const args = [
		"docs", "+create",
		"--api-version", "v2",
		"--content", xmlContent,
	];

	const {stdout} = await runCommand(resolvedPath, args);

	// Try to find JSON output from lark-cli
	const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
	let parsed: Record<string, unknown> | undefined;

	for (const line of lines) {
		if (line.startsWith("{")) {
			try {
				parsed = JSON.parse(line) as Record<string, unknown>;
				break;
			} catch {
				// not valid JSON, continue
			}
		}
	}

	if (!parsed) {
		// Fallback: try to extract URL from any line
		const urlMatch = stdout.match(/https:\/\/[^\s]+/);
		if (urlMatch) {
			const url = urlMatch[0];
			const docId = extractDocIdFromUrl(url);
			if (docId) {
				return {docId, url, title};
			}
		}
		throw new LarkCliError("Could not parse Lark CLI output. Raw stdout:\n" + stdout);
	}

	if (parsed.error) {
		throw new LarkCliError(String((parsed.error as Record<string, string>).message || JSON.stringify(parsed.error)));
	}

	const docToken = extractString(parsed, ["document.document_id", "document.open_url", "url", "token", "doc_token"]);
	const url = extractString(parsed, ["document.open_url", "url"]) || (docToken ? `https://www.feishu.cn/docs/${docToken}` : "");
	const resolvedTitle = extractString(parsed, ["document.title", "title"]) || title;

	if (!docToken) {
		throw new LarkCliError("Failed to extract document token from Lark CLI output: " + stdout);
	}

	return {docId: docToken, url, title: resolvedTitle};
}

/**
 * Fetch the current title of a Feishu document.
 */
export async function fetchFeishuDocumentTitle(
	cliPath: string,
	docToken: string
): Promise<string> {
	const resolvedPath = getEffectiveLarkCliPath(cliPath);
	const args = [
		"docs", "+fetch",
		"--api-version", "v2",
		"--doc", docToken,
	];

	const {stdout} = await runCommand(resolvedPath, args);

	// Try JSON first
	const lines = stdout.split("\n").map(l => l.trim()).filter(Boolean);
	for (const line of lines) {
		if (line.startsWith("{")) {
			try {
				const parsed = JSON.parse(line) as Record<string, unknown>;
				if (parsed.error) {
					throw new LarkCliError(String((parsed.error as Record<string, string>).message || JSON.stringify(parsed.error)));
				}
				const title = extractString(parsed, ["document.title", "title"]);
				if (title) return title;
			} catch {
				// continue
			}
		}
	}

	// Fallback: try to extract <title> from XML output
	const titleMatch = stdout.match(/<title>([^<]+)<\/title>/);
	if (titleMatch?.[1]) {
		return titleMatch[1];
	}

	return "";
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

function extractDocIdFromUrl(url: string): string | undefined {
	const match = url.match(/(?:docs|docx|wiki)\/([a-zA-Z0-9]+)/);
	return match?.[1];
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
