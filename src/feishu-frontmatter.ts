import {getFrontMatterInfo, parseYaml} from "obsidian";
import type {App, TFile} from "obsidian";
import type {FeishuFrontMatter} from "./types";

export async function readFeishuFrontMatter(
	app: App,
	file: TFile
): Promise<FeishuFrontMatter | undefined> {
	const cached = normalizeFeishuFrontMatter(app.metadataCache.getFileCache(file)?.frontmatter);
	if (cached) return cached;

	const content = await app.vault.cachedRead(file);
	return parseFeishuFrontMatterContent(content);
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
