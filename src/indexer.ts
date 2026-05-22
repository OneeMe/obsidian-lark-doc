import {App, TFile} from "obsidian";
import type {FeishuFrontMatter, IndexEntry} from "./types";
import {extractDocIdFromUrl, normalizeFeishuUrl} from "./types";
import {readFeishuFrontMatter} from "./feishu-frontmatter";

function debugLog(message: string, ...data: unknown[]): void {
	console.debug("[obsidian-lark][debug]", message, ...data);
}

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
		const isLarkMarkdown = path.endsWith(".lark.md");
		if (isLarkMarkdown) {
			debugLog("FeishuIndexer.getEntryByPath start", {path});
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			if (isLarkMarkdown) {
				console.warn("[obsidian-lark][debug] FeishuIndexer path is not a TFile", {
					path,
					value: file,
				});
			}
			return undefined;
		}

		const fm = await this.readFrontMatter(file);
		if (!fm) {
			if (isLarkMarkdown) {
				console.warn("[obsidian-lark][debug] FeishuIndexer found no front matter", {path});
			}
			return undefined;
		}

		const docId = fm.feishu_doc_id ?? extractDocIdFromUrl(fm.feishu_url ?? "") ?? "";
		const url = fm.feishu_url ? normalizeFeishuUrl(fm.feishu_url) : "";

		if (!docId || !url) {
			if (isLarkMarkdown) {
				console.warn("[obsidian-lark][debug] FeishuIndexer front matter is incomplete", {
					path,
					docId,
					url,
					frontmatter: fm,
				});
			}
			return undefined;
		}

		if (isLarkMarkdown) {
			debugLog("FeishuIndexer resolved entry", {
				path: file.path,
				docId,
				url,
				title: fm.feishu_title,
			});
		}
		return {
			path: file.path,
			feishu_doc_id: docId,
			feishu_url: url,
			feishu_title: fm.feishu_title,
			mtime: file.stat.mtime,
		};
	}
}
