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
	lark_doc_id?: string;
	/** Full Feishu document URL */
	lark_url?: string;
	/** Cached title of the Feishu document */
	lark_title?: string;
}

/**
 * A single entry in the Feishu index.
 */
export interface IndexEntry {
	/** Vault-relative path to the markdown file */
	path: string;
	/** Feishu document ID */
	lark_doc_id: string;
	/** Feishu document URL */
	lark_url: string;
	/** Cached title */
	lark_title?: string;
	/** Last modified time of the file (timestamp) */
	mtime: number;
}

/**
 * Regular expressions for Feishu URL parsing.
 * Matches any subdomain of feishu.cn / larksuite.com with docs/docx/wiki/base paths.
 */
const FEISHU_URL_PATTERNS = [
	/[\w-]+\.feishu\.cn\/(?:docs|docx|wiki|base)\/([a-zA-Z0-9]+)/,
	/[\w-]+\.larksuite\.com\/(?:docs|docx|wiki|base)\/([a-zA-Z0-9]+)/,
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
 * Normalize a Feishu URL — strip query params and fragments,
 * but preserve the original domain and path type.
 */
export function normalizeFeishuUrl(url: string): string {
	const trimmed = url.trim();
	try {
		const u = new URL(trimmed);
		if (!isFeishuBaseUrl(trimmed)) {
			// Strip query params and hash, keep origin + pathname
			return `${u.origin}${u.pathname}`;
		}

		const params = new URLSearchParams();
		for (const key of ["table", "view"]) {
			const value = u.searchParams.get(key);
			if (value) params.set(key, value);
		}
		const query = params.toString();
		return query ? `${u.origin}${u.pathname}?${query}` : `${u.origin}${u.pathname}`;
	} catch {
		return trimmed;
	}
}

export function isFeishuBaseUrl(url: string): boolean {
	try {
		const u = new URL(url.trim());
		return (
			/^[\w-]+\.feishu\.cn$/.test(u.hostname)
			|| /^[\w-]+\.larksuite\.com$/.test(u.hostname)
		) && /^\/base\/[a-zA-Z0-9]+/.test(u.pathname);
	} catch {
		return /[\w-]+\.(?:feishu\.cn|larksuite\.com)\/base\/[a-zA-Z0-9]+/.test(url);
	}
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
