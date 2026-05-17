/**
 * Information about a Feishu document returned by Lark CLI.
 */
export interface FeishuDocInfo {
	docId: string;
	url: string;
	title: string;
}

/**
 * Front matter fields used to associate an Obsidian note with a Feishu document.
 */
export interface FeishuFrontMatter {
	/** Feishu document ID (token) */
	feishu_doc_id?: string;
	/** Full Feishu document URL */
	feishu_url?: string;
	/** Cached title of the Feishu document */
	feishu_title?: string;
}

/**
 * A single entry in the Feishu index.
 */
export interface IndexEntry {
	/** Vault-relative path to the markdown file */
	path: string;
	/** Feishu document ID */
	feishu_doc_id: string;
	/** Feishu document URL */
	feishu_url: string;
	/** Cached title */
	feishu_title?: string;
	/** Last modified time of the file (timestamp) */
	mtime: number;
}

/**
 * Regular expressions for Feishu URL parsing.
 */
const FEISHU_URL_PATTERNS = [
	/feishu\.cn\/(?:docs|docx|wiki)\/([a-zA-Z0-9]+)/,
	/larksuite\.com\/(?:docs|docx|wiki)\/([a-zA-Z0-9]+)/,
];

/**
 * Extract a Feishu document ID from a URL.
 */
export function extractDocIdFromUrl(url: string): string | undefined {
	for (const pattern of FEISHU_URL_PATTERNS) {
		const match = pattern.exec(url);
		if (match?.[1]) {
			return match[1];
		}
	}
	return undefined;
}

/**
 * Normalize a Feishu URL to a canonical form.
 */
export function normalizeFeishuUrl(url: string): string {
	const docId = extractDocIdFromUrl(url);
	if (!docId) {
		return url.trim();
	}
	return `https://www.feishu.cn/docs/${docId}`;
}

/**
 * Parsed result from a Feishu URL.
 */
export interface ParsedFeishuUrl {
	docId: string;
	url: string;
}

/**
 * Validate and parse a Feishu URL.
 */
export function parseFeishuUrl(url: string): ParsedFeishuUrl | undefined {
	const trimmed = url.trim();
	const docId = extractDocIdFromUrl(trimmed);
	if (!docId) {
		return undefined;
	}
	return {
		docId,
		url: normalizeFeishuUrl(trimmed),
	};
}
