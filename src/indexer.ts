import {App, TFile, parseFrontMatterEntry, parseYaml} from "obsidian";
import type {FeishuFrontMatter, IndexEntry} from "./types";
import {extractDocIdFromUrl, normalizeFeishuUrl} from "./types";

const INDEX_DATA_KEY = "feishuIndex";

/**
 * Manages the vault-wide index of Feishu-associated notes.
 */
export class FeishuIndexer {
	private app: App;
	private pluginLoadData: () => Promise<unknown>;
	private pluginSaveData: (data: unknown) => Promise<void>;

	constructor(
		app: App,
		pluginLoadData: () => Promise<unknown>,
		pluginSaveData: (data: unknown) => Promise<void>
	) {
		this.app = app;
		this.pluginLoadData = pluginLoadData;
		this.pluginSaveData = pluginSaveData;
	}

	/**
	 * Read front matter from a TFile and return Feishu-related fields.
	 */
	async readFrontMatter(file: TFile): Promise<FeishuFrontMatter | undefined> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			return undefined;
		}
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
		// Only return if there is at least one Feishu field
		if (result.feishu_doc_id || result.feishu_url) {
			return result;
		}
		return undefined;
	}

	/**
	 * Check whether a file has Feishu front matter.
	 */
	async hasFeishuAssociation(file: TFile): Promise<boolean> {
		const fm = await this.readFrontMatter(file);
		return !!fm;
	}

	/**
	 * Scan the entire vault for markdown files with Feishu associations.
	 */
	async scanVault(): Promise<IndexEntry[]> {
		const files = this.app.vault.getMarkdownFiles();
		const entries: IndexEntry[] = [];
		for (const file of files) {
			const fm = await this.readFrontMatter(file);
			if (fm) {
				const docId = fm.feishu_doc_id ?? extractDocIdFromUrl(fm.feishu_url ?? "") ?? "";
				const url = fm.feishu_url ?? (docId ? `https://www.feishu.cn/docs/${docId}` : "");
				if (docId && url) {
					entries.push({
						path: file.path,
						feishu_doc_id: docId,
						feishu_url: normalizeFeishuUrl(url),
						feishu_title: fm.feishu_title,
						mtime: file.stat.mtime,
					});
				}
			}
		}
		return entries;
	}

	/**
	 * Rebuild and persist the index.
	 */
	async rebuildIndex(): Promise<IndexEntry[]> {
		const entries = await this.scanVault();
		await this.saveIndex(entries);
		return entries;
	}

	/**
	 * Load the persisted index.
	 */
	async loadIndex(): Promise<IndexEntry[]> {
		const data = await this.pluginLoadData() as Record<string, unknown> | undefined;
		const raw = data?.[INDEX_DATA_KEY];
		if (Array.isArray(raw)) {
			return raw as IndexEntry[];
		}
		return [];
	}

	/**
	 * Persist the index.
	 */
	async saveIndex(entries: IndexEntry[]): Promise<void> {
		const data = (await this.pluginLoadData() as Record<string, unknown> | undefined) ?? {};
		data[INDEX_DATA_KEY] = entries;
		await this.pluginSaveData(data);
	}

	/**
	 * Look up an index entry by vault path.
	 */
	async getEntryByPath(path: string): Promise<IndexEntry | undefined> {
		const index = await this.loadIndex();
		return index.find(e => e.path === path);
	}

	/**
	 * Look up an index entry by Feishu doc ID.
	 */
	async getEntryByDocId(docId: string): Promise<IndexEntry | undefined> {
		const index = await this.loadIndex();
		return index.find(e => e.feishu_doc_id === docId);
	}
}
