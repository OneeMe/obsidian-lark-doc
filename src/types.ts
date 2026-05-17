/**
 * Front matter fields used to associate an Obsidian note with a Feishu document.
 */
export interface FeishuFrontMatter {
	/** Feishu document ID extracted from the URL */
	feishu_doc_id?: string;
	/** Full Feishu document URL */
	feishu_url?: string;
	/** Optional human-readable title of the Feishu document */
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
	/** Optional title */
	feishu_title?: string;
	/** Last modified time of the file (timestamp) */
	mtime: number;
}

/**
 * Parsed result from a Feishu URL.
 */
export interface ParsedFeishuUrl {
	/** Raw document ID from the URL */
	docId: string;
	/** Canonical Feishu URL */
	url: string;
}

/**
 * Regular expressions for Feishu URL parsing.
 */
const FEISHU_URL_PATTERNS = [
	// feishu.cn / larksuite.com / feishu.cn variants
	/feishu\.cn\/(?:docs|docx|wiki)\/([a-zA-Z0-9]+)/,
	/larksuite\.com\/(?:docs|docx|wiki)\/([a-zA-Z0-9]+)/,
];

/**
 * Extract a Feishu document ID from a URL.
 * Returns undefined if the URL is not a recognized Feishu document URL.
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
	// Prefer feishu.cn/docs/ form
	return `https://www.feishu.cn/docs/${docId}`;
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
