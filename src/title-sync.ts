import {TFile, normalizePath} from "obsidian";
import type {App} from "obsidian";
import {fetchFeishuDocumentTitle} from "./lark-cli";
import {readFeishuFrontMatter} from "./feishu-frontmatter";

export interface TitleSyncOptions {
	cliPath: string;
	syncToFilename: boolean;
}

export async function syncTitle(
	app: App,
	file: TFile,
	options: TitleSyncOptions
): Promise<boolean> {
	const fm = await readFeishuFrontMatter(app, file);
	if (!fm?.feishu_doc_id) {
		return false;
	}

	const docId = String(fm.feishu_doc_id);
	let newTitle: string;

	try {
		newTitle = await fetchFeishuDocumentTitle(options.cliPath, docId);
	} catch (err) {
		console.error("[obsidian-feishu] title sync fetch error:", err);
		return false;
	}

	if (!newTitle || newTitle === fm.feishu_title) {
		return false;
	}

	await updateFrontMatterTitle(app, file, newTitle);

	if (options.syncToFilename) {
		const newName = `${sanitizeFilename(newTitle)}.${file.extension}`;
		const folder = file.parent?.path ?? "";
		const newPath = normalizePath(folder ? `${folder}/${newName}` : newName);

		if (newPath !== file.path && !app.vault.getAbstractFileByPath(newPath)) {
			await app.vault.rename(file, newPath);
		}
	}

	return true;
}

async function updateFrontMatterTitle(
	app: App,
	file: TFile,
	newTitle: string
): Promise<void> {
	const content = await app.vault.read(file);
	const lines = content.split("\n");

	let inFm = false;
	let fmStart = -1;
	let fmEnd = -1;
	let titleLine = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i === 0 && line?.trim() === "---") {
			inFm = true;
			fmStart = i;
			continue;
		}
		if (inFm && line?.trim() === "---") {
			inFm = false;
			fmEnd = i;
			break;
		}
		if (inFm && line?.startsWith("feishu_title:")) {
			titleLine = i;
		}
	}

	if (titleLine >= 0) {
		lines[titleLine] = `feishu_title: ${newTitle}`;
		await app.vault.modify(file, lines.join("\n"));
	} else if (fmStart >= 0 && fmEnd >= 0) {
		lines.splice(fmEnd, 0, `feishu_title: ${newTitle}`);
		await app.vault.modify(file, lines.join("\n"));
	}
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"\u003c\u003e|]/g, " ").trim();
}
