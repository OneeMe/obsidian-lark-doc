import {App, TFile} from "obsidian";
import type {FeishuFrontMatter, IndexEntry} from "./types";
import {extractDocIdFromUrl, normalizeFeishuUrl} from "./types";
import {readFeishuFrontMatter} from "./feishu-frontmatter";

export class FeishuIndexer {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async readFrontMatter(file: TFile): Promise<FeishuFrontMatter | undefined> {
		return await readFeishuFrontMatter(this.app, file);
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
		const url = fm.feishu_url ? normalizeFeishuUrl(fm.feishu_url) : "";

		if (!docId || !url) return undefined;

		return {
			path: file.path,
			feishu_doc_id: docId,
			feishu_url: url,
			feishu_title: fm.feishu_title,
			mtime: file.stat.mtime,
		};
	}
}
