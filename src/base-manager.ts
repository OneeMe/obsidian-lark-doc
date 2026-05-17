import {App, normalizePath, TFile} from "obsidian";

export const BASE_FILE_NAME = "Feishu Documents.base";

const BASE_CONTENT = `filters: 'feishu_doc_id'

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

	if (existing instanceof TFile) {
		// Update existing file if the filters line has changed
		const current = await app.vault.read(existing);
		const currentFilterLine = current.split("\n")[0]?.trim();
		const newFilterLine = BASE_CONTENT.split("\n")[0]?.trim();
		if (currentFilterLine !== newFilterLine) {
			await app.vault.modify(existing, BASE_CONTENT);
		}
		return;
	}

	try {
		await app.vault.create(path, BASE_CONTENT);
	} catch (err) {
		// Ignore "already exists" — race condition during startup
		if (err instanceof Error && err.message.includes("already exists")) {
			return;
		}
		throw err;
	}
}
