import {TFile, normalizePath} from "obsidian";
import type {App} from "obsidian";
import {fetchFeishuDocumentTitle} from "./lark-cli";
import {readFeishuFrontMatter} from "./feishu-frontmatter";
import {isLarkMarkdownFile, LARK_MARKDOWN_SUFFIX} from "./lark-file";

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
		console.error("[obsidian-lark] title sync fetch error:", err);
		return false;
	}

	if (!newTitle) {
		return false;
	}

	const titleChanged = newTitle !== fm.feishu_title;
	if (titleChanged) {
		await updateFrontMatterTitle(app, file, newTitle);
	}

	let filenameChanged = false;
	if (options.syncToFilename || isLarkMarkdownFile(file)) {
		filenameChanged = await syncFilenameToTitle(app, file, newTitle);
	}

	return titleChanged || filenameChanged;
}

async function syncFilenameToTitle(app: App, file: TFile, title: string): Promise<boolean> {
	const safeTitle = sanitizeFilename(title);
	if (!safeTitle) return false;

	const newPath = resolveUniqueSyncedPath(app, file, safeTitle);
	if (newPath === file.path) return false;

	await app.vault.rename(file, newPath);
	return true;
}

function resolveUniqueSyncedPath(app: App, file: TFile, safeTitle: string): string {
	const suffix = isLarkMarkdownFile(file) ? LARK_MARKDOWN_SUFFIX : `.${file.extension}`;
	const folder = file.parent?.path ?? "";
	const basePath = normalizePath(folder ? `${folder}/${safeTitle}` : safeTitle);
	let candidate = `${basePath}${suffix}`;
	let index = 1;

	while (candidate !== file.path && app.vault.getAbstractFileByPath(candidate)) {
		candidate = `${basePath} (${index})${suffix}`;
		index++;
	}

	return candidate;
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
