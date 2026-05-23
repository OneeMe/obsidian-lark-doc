import {getFrontMatterInfo, parseYaml} from "obsidian";
import type {App, TFile} from "obsidian";
import type {FeishuFrontMatter} from "./types";

function debugLog(message: string, ...data: unknown[]): void {
	console.debug("[obsidian-lark-doc][debug]", message, ...data);
}

export async function readFeishuFrontMatter(
	app: App,
	file: TFile
): Promise<FeishuFrontMatter | undefined> {
	const cached = normalizeFeishuFrontMatter(app.metadataCache.getFileCache(file)?.frontmatter);
	if (cached) {
		if (file.path.endsWith(".lark.md")) {
			debugLog("readFeishuFrontMatter used metadata cache", {
				path: file.path,
				hasUrl: !!cached.lark_url,
				url: cached.lark_url,
				title: cached.lark_title,
			});
		}
		return cached;
	}

	const content = await app.vault.cachedRead(file);
	const parsed = parseFeishuFrontMatterContent(content);
	if (file.path.endsWith(".lark.md")) {
		debugLog("readFeishuFrontMatter parsed file content", {
			path: file.path,
			hasFrontMatter: !!parsed,
			hasUrl: !!parsed?.lark_url,
			url: parsed?.lark_url,
			title: parsed?.lark_title,
		});
	}
	return parsed;
}

export function parseFeishuFrontMatterContent(content: string): FeishuFrontMatter | undefined {
	const info = getFrontMatterInfo(content);
	if (!info.exists || !info.frontmatter.trim()) return undefined;

	try {
		return normalizeFeishuFrontMatter(parseYaml(info.frontmatter));
	} catch {
		return undefined;
	}
}

export function normalizeFeishuFrontMatter(input: unknown): FeishuFrontMatter | undefined {
	if (!input || typeof input !== "object") return undefined;

	const fm = input as Record<string, unknown>;
	const result: FeishuFrontMatter = {};

	const docId = readString(fm.lark_doc_id);
	if (docId) result.lark_doc_id = docId;

	const url = readString(fm.lark_url);
	if (url) result.lark_url = url;

	const title = readString(fm.lark_title);
	if (title) result.lark_title = title;

	return result.lark_doc_id || result.lark_url ? result : undefined;
}

function readString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
