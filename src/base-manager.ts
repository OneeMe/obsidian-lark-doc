import {App, normalizePath, TFile} from "obsidian";
import {translate, type Translator} from "./i18n";

export const BASE_FILE_NAME = "Lark Documents.base";

function createBaseContent(t: Translator = (key, vars) => translate("en", key, vars)): string {
	return `filters: 'lark_doc_id'

properties:
  lark_title:
    displayName: "${t("base.larkTitle")}"
  lark_url:
    displayName: "${t("base.url")}"

formulas:
  doc_link: 'link(lark_url, lark_title)'

views:
  - type: table
    name: "${t("base.allDocuments")}"
    order:
      - file.name
      - lark_title
      - lark_url
      - file.mtime
`;
}

export function getBaseFilePath(defaultNoteFolder: string): string {
	const folderPath = normalizePath(defaultNoteFolder.trim());
	return folderPath ? normalizePath(`${folderPath}/${BASE_FILE_NAME}`) : normalizePath(BASE_FILE_NAME);
}

export async function ensureBaseFile(
	app: App,
	defaultNoteFolder: string,
	t?: Translator
): Promise<void> {
	const path = getBaseFilePath(defaultNoteFolder);
	const baseContent = createBaseContent(t);
	const existing = app.vault.getAbstractFileByPath(path);

	if (existing instanceof TFile) {
		await updateBaseContent(app, path, baseContent, existing);
		return;
	}

	if (await adapterPathExists(app, path)) {
		await updateBaseContent(app, path, baseContent);
		return;
	}

	const folderPath = normalizePath(defaultNoteFolder.trim());
	await ensureFolder(app, folderPath);

	await createBaseFile(app, path, baseContent);
}

async function updateBaseContent(
	app: App,
	path: string,
	baseContent: string,
	file?: TFile
): Promise<void> {
	const current = file
		? await app.vault.read(file)
		: await app.vault.adapter.read(path);
	const currentFilterLine = current.split("\n")[0]?.trim();
	const newFilterLine = baseContent.split("\n")[0]?.trim();
	if (currentFilterLine === newFilterLine) return;

	if (file) {
		try {
			await app.vault.modify(file, baseContent);
			return;
		} catch (err) {
			await writeBaseFileWithAdapterFallback(app, path, baseContent, err);
			return;
		}
	}

	await app.vault.adapter.write(path, baseContent);
}

async function createBaseFile(app: App, path: string, baseContent: string): Promise<void> {
	try {
		await app.vault.create(path, baseContent);
		return;
	} catch (err) {
		if (isAlreadyExistsError(err) || await adapterPathExists(app, path)) {
			return;
		}
		await writeBaseFileWithAdapterFallback(app, path, baseContent, err);
	}
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	/* c8 ignore next */
	if (!folderPath) return;

	const parts = folderPath.split("/").filter(Boolean);
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		if (app.vault.getAbstractFileByPath(current) || await adapterPathExists(app, current)) {
			continue;
		}

		try {
			await app.vault.createFolder(current);
		} catch (err) {
			if (isAlreadyExistsError(err) || await adapterPathExists(app, current)) {
				continue;
			}
			try {
				await app.vault.adapter.mkdir(current);
			} catch (adapterErr) {
				if (isAlreadyExistsError(adapterErr) || await adapterPathExists(app, current)) {
					continue;
				}
				throw combineErrors(`create folder ${current}`, err, adapterErr);
			}
		}
	}
}

async function writeBaseFileWithAdapterFallback(
	app: App,
	path: string,
	baseContent: string,
	originalErr: unknown
): Promise<void> {
	try {
		await app.vault.adapter.write(path, baseContent);
	} catch (adapterErr) {
		if (isAlreadyExistsError(adapterErr) || await adapterPathExists(app, path)) {
			return;
		}
		throw combineErrors("write base file", originalErr, adapterErr);
	}
}

async function adapterPathExists(app: App, path: string): Promise<boolean> {
	try {
		return await app.vault.adapter.exists(path);
	} catch {
		return false;
	}
}

function isAlreadyExistsError(err: unknown): boolean {
	return err instanceof Error && err.message.includes("already exists");
}

function combineErrors(operation: string, primary: unknown, fallback: unknown): Error {
	return new Error(
		`Failed to ${operation}. Vault error: ${formatError(primary)}. Adapter error: ${formatError(fallback)}`
	);
}

function formatError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
