import {App, normalizePath} from "obsidian";

const BASE_FILE_NAME = "Feishu Documents.base";

const BASE_CONTENT = `filters: 'feishu_doc_id != ""'

properties:
  feishu_title:
    displayName: "Feishu Title"
  feishu_url:
    displayName: "URL"

formulas:
  doc_link: 'link(feishu_url, feishu_title)'

views:
  - type: table
    name: "All Documents"
    order:
      - file.name
      - feishu_title
      - feishu_url
      - file.mtime
`;

export async function ensureBaseFile(app: App): Promise<void> {
	const path = normalizePath(BASE_FILE_NAME);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) {
		return;
	}
	await app.vault.create(path, BASE_CONTENT);
}
