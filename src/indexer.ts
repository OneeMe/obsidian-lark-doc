import {App, TFile} from "obsidian";
import type {FeishuFrontMatter, IndexEntry} from "./types";
import {extractDocIdFromUrl, normalizeFeishuUrl} from "./types";

export class FeishuIndexer {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async readFrontMatter(file: TFile): Promise<FeishuFrontMatter | undefined> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return undefined;

		const fm = cache.frontmatter;
		const result: FeishuFrontMatter = {};

		if (typeof fm.feishu_doc_id === "string" && fm.feishu_doc_id.length > 0) {
			result.feishu_doc_id = fm.feishu_doc_id;
		}
		if (typeof fm.feishu_url === "string" && fm.feishu_url.length > 0) {
			result.feishu_url = fm.feishu_url;
		}
		if (typeof fm.feishu_title === "string" && fm.feishu_title.length > 0) {
			result.feishu_title = fm.feishu_title;
		}

		return result.feishu_doc_id || result.feishu_url ? result : undefined;
	}

	async hasFeishuAssociation(file: TFile): Promise<boolean> {
		return !!(await this.readFrontMatter(file));
	}

	async getEntryByPath(path: string): Promise<IndexEntry | undefined> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return undefined;

		const fm = await this.readFrontMatter(file);
		if (!fm) return undefined;

		const docId = fm.feishu_doc_id ?? extractDocIdFromUrl(fm.feishu_url ?? "") ?? "";
		const url = fm.feishu_url ?? (docId ? `https://www.feishu.cn/docs/${docId}` : "");

		if (!docId || !url) return undefined;

		return {
			path: file.path,
			feishu_doc_id: docId,
			feishu_url: normalizeFeishuUrl(url),
			feishu_title: fm.feishu_title,
			mtime: file.stat.mtime,
		};
	}
}
