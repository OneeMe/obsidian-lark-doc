import {getFrontMatterInfo, parseYaml} from "obsidian";
import type {App, TFile} from "obsidian";
import type {FeishuFrontMatter} from "./types";

function debugLog(message: string, ...data: unknown[]): void {
	console.debug("[obsidian-lark][debug]", message, ...data);
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
				hasUrl: !!cached.feishu_url,
				url: cached.feishu_url,
				title: cached.feishu_title,
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
			hasUrl: !!parsed?.feishu_url,
			url: parsed?.feishu_url,
			title: parsed?.feishu_title,
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

	const docId = readString(fm.feishu_doc_id);
	if (docId) result.feishu_doc_id = docId;

	const url = readString(fm.feishu_url);
	if (url) result.feishu_url = url;

	const title = readString(fm.feishu_title);
	if (title) result.feishu_title = title;

	return result.feishu_doc_id || result.feishu_url ? result : undefined;
}

function readString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
