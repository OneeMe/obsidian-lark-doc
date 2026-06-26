import {normalizePath, TFile} from "obsidian";
import type {App} from "obsidian";
import {LARK_MARKDOWN_SUFFIX} from "./lark-file";
import {translate, type Translator} from "./i18n";
import {isFeishuBaseUrl} from "./types";

export interface CreateLarkMarkdownNoteOptions {
	folderPath: string;
	templatePath?: string;
	title: string;
	docId: string;
	url: string;
	translate?: Translator;
	onTemplateMissing?: (path: string) => void;
}

export async function createLarkMarkdownNote(
	app: App,
	options: CreateLarkMarkdownNoteOptions
): Promise<TFile> {
	const folderPath = normalizePath(options.folderPath);

	const folderExists = app.vault.getAbstractFileByPath(folderPath);
	if (!folderExists) {
		await app.vault.createFolder(folderPath);
	}

	const body = await readTemplateBody(app, options);
	const frontMatter = [
		"---",
		`lark_doc_id: ${options.docId}`,
		`lark_url: ${options.url}`,
		`lark_title: ${options.title}`,
		"---",
		"",
	].join("\n");

	const t = options.translate ?? ((key, vars) => translate("en", key, vars));
	const shadowNotice = [
		`> **${t("shadow.title")}** - ${t("shadow.description")}`,
		">",
		`> **${t("shadow.wikiUrl")}:** ${options.url}`,
		">",
		`> **${t("shadow.nodeInfo")}:**`,
		"> ```bash",
		`> ${createInspectCommand(options)}`,
		"> ```",
		">",
		`> ${t("shadow.footer")}`,
		"",
	].join("\n");

	const content = body
		? `${frontMatter}${shadowNotice}${body}`
		: `${frontMatter}${shadowNotice}`;
	const filePath = normalizePath(`${folderPath}/${sanitizeFilename(options.title)}${LARK_MARKDOWN_SUFFIX}`);
	const finalPath = resolveCollision(app, filePath);

	return await app.vault.create(finalPath, content);
}

function createInspectCommand(options: CreateLarkMarkdownNoteOptions): string {
	if (isFeishuBaseUrl(options.url)) {
		return `lark-cli base +base-get --as user --base-token ${options.docId}`;
	}
	return `lark-cli wiki spaces get_node --as user --params '{"token":"${options.docId}"}' --format json`;
}

async function readTemplateBody(
	app: App,
	options: CreateLarkMarkdownNoteOptions
): Promise<string> {
	if (!options.templatePath) return "";

	const templateFile = app.vault.getAbstractFileByPath(normalizePath(options.templatePath));
	if (templateFile instanceof TFile) {
		return await app.vault.read(templateFile);
	}

	options.onTemplateMissing?.(options.templatePath);
	return "";
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"\u003c\u003e|]/g, " ").trim();
}

function resolveCollision(app: App, path: string): string {
	let candidate = path;
	let counter = 1;
	const base = candidate.slice(0, -LARK_MARKDOWN_SUFFIX.length);

	while (app.vault.getAbstractFileByPath(candidate)) {
		candidate = `${base} (${counter})${LARK_MARKDOWN_SUFFIX}`;
		counter++;
	}

	return candidate;
}
