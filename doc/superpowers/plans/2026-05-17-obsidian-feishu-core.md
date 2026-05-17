# Obsidian Feishu Core Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to create Feishu documents from Obsidian, auto-generate linked notes, sync titles, and manage associations via Obsidian Base.

**Architecture:** Desktop-only plugin using `child_process` to invoke Lark CLI. New modules for CLI wrapping, document creation, title sync, and Base management. `FeishuIndexPanel` removed in favor of native Base UI.

**Tech Stack:** TypeScript, Obsidian Plugin API, Lark CLI, Obsidian Base (YAML).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `manifest.json` | Mark plugin desktop-only |
| `src/settings.ts` | Extended settings with Lark CLI path, folder, sync options |
| `src/types.ts` | Shared interfaces (FeishuDocInfo, settings) |
| `src/lark-cli.ts` | `child_process.spawn` wrapper for Lark CLI, JSON parsing |
| `src/doc-creator.ts` | Modal UI + orchestration: create Feishu doc → Obsidian note |
| `src/title-sync.ts` | Fetch Feishu title, update front matter and optionally rename file |
| `src/base-manager.ts` | Ensure `Feishu Documents.base` exists in vault root |
| `src/feishu-view.ts` | Inline iframe preview (minor cleanup) |
| `src/indexer.ts` | Simplified: front matter reader only |
| `src/main.ts` | Register commands, wire up modules, lifecycle |
| `src/index-panel.ts` | **Delete** — replaced by Base |

---

### Task 1: Mark Desktop-Only

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Change `isDesktopOnly` to `true`**

```json
{
  "id": "obsidian-feishu",
  "name": "Obsidian Feishu",
  "version": "1.0.0",
  "minAppVersion": "0.15.0",
  "description": "Bridge Obsidian vault with Feishu (Lark) documents.",
  "author": "OneeMe",
  "authorUrl": "https://github.com/OneeMe",
  "isDesktopOnly": true
}
```

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "chore(manifest): mark plugin as desktop-only for child_process access"
```

---

### Task 2: Extend Settings

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Expand settings interface and defaults**

Replace the entire file with:

```typescript
import {App, PluginSettingTab, Setting} from "obsidian";
import type ObsidianFeishuPlugin from "./main";

export interface ObsidianFeishuSettings {
	larkCliPath: string;
	defaultNoteFolder: string;
	autoOpenFeishuView: boolean;
	syncTitle: boolean;
	syncTitleToFilename: boolean;
	syncIntervalMinutes: number;
	noteTemplate: string;
}

export const DEFAULT_SETTINGS: ObsidianFeishuSettings = {
	larkCliPath: "lark-cli",
	defaultNoteFolder: "Feishu",
	autoOpenFeishuView: true,
	syncTitle: true,
	syncTitleToFilename: false,
	syncIntervalMinutes: 0,
	noteTemplate: "",
};

export class FeishuSettingTab extends PluginSettingTab {
	plugin: ObsidianFeishuPlugin;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();
		containerEl.createEl("h2", {text: "Obsidian Feishu Settings"});

		new Setting(containerEl)
			.setName("Lark CLI path")
			.setDesc("Path to the lark-cli executable.")
			.addText(text => text
				.setPlaceholder("lark-cli")
				.setValue(this.plugin.settings.larkCliPath)
				.onChange(async (value) => {
					this.plugin.settings.larkCliPath = value.trim() || "lark-cli";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default note folder")
			.setDesc("Vault folder where new Feishu-linked notes are created.")
			.addText(text => text
				.setPlaceholder("Feishu")
				.setValue(this.plugin.settings.defaultNoteFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultNoteFolder = value.trim() || "Feishu";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-open Feishu view")
			.setDesc("Automatically open the Feishu document preview when you open a linked note.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenFeishuView)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenFeishuView = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Sync title from Feishu")
			.setDesc("Fetch the latest title from Feishu when opening a linked note.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTitle)
				.onChange(async (value) => {
					this.plugin.settings.syncTitle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Sync title to filename")
			.setDesc("Rename the Obsidian note file when the Feishu title changes.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTitleToFilename)
				.onChange(async (value) => {
					this.plugin.settings.syncTitleToFilename = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Background sync interval (minutes)")
			.setDesc("How often to check for title changes in the background (0 = disabled).")
			.addSlider(slider => slider
				.setLimits(0, 60, 5)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Note template")
			.setDesc("Optional template file (vault path) for new notes. Front matter is prepended automatically.")
			.addText(text => text
				.setPlaceholder("Templates/Feishu Note.md")
				.setValue(this.plugin.settings.noteTemplate)
				.onChange(async (value) => {
					this.plugin.settings.noteTemplate = value.trim();
					await this.plugin.saveSettings();
				}));
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/settings.ts
git commit -m "feat(settings): add Lark CLI path, folder, sync options"
```

---

### Task 3: Expand Types

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add FeishuDocInfo and extend exports**

Replace the entire file with:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add FeishuDocInfo interface, clean up exports"
```

---

### Task 4: Create Lark CLI Wrapper

**Files:**
- Create: `src/lark-cli.ts`

- [ ] **Step 1: Implement Lark CLI process wrapper**

```typescript
import { Notice } from "obsidian";
import { spawn } from "child_process";
import type { FeishuDocInfo } from "./types";

export class LarkCliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LarkCliError";
	}
}

function runCommand(
	cliPath: string,
	args: string[]
): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const proc = spawn(cliPath, args, { shell: false });
		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("error", (err) => {
			reject(new LarkCliError(`Failed to spawn Lark CLI: ${err.message}`));
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				reject(new LarkCliError(stderr || `Lark CLI exited with code ${code}`));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

/**
 * Create a new Feishu document via Lark CLI.
 */
export async function createFeishuDocument(
	cliPath: string,
	title: string,
	content?: string
): Promise<FeishuDocInfo> {
	const xmlContent = content
		? `<title>${escapeXml(title)}</title><p>${escapeXml(content)}</p>`
		: `<title>${escapeXml(title)}</title>`;

	const args = [
		"docs", "+create",
		"--api-version", "v2",
		"--content", xmlContent,
		"--format", "json",
	];

	const { stdout } = await runCommand(cliPath, args);

	// Lark CLI may print non-JSON lines before the JSON output.
	const jsonLine = stdout.split("\n").find(line => line.trim().startsWith("{"));
	if (!jsonLine) {
		throw new LarkCliError("No JSON output from lark-cli docs +create");
	}

	const parsed = JSON.parse(jsonLine);
	if (parsed.error) {
		throw new LarkCliError(parsed.error.message || JSON.stringify(parsed.error));
	}

	const docToken = parsed.document?.document_id || parsed.document?.open_url || parsed.url;
	const url = parsed.document?.open_url || parsed.url || `https://www.feishu.cn/docs/${docToken}`;
	const resolvedTitle = parsed.document?.title || title;

	if (!docToken) {
		throw new LarkCliError("Failed to extract document token from Lark CLI output");
	}

	return {
		docId: docToken,
		url,
		title: resolvedTitle,
	};
}

/**
 * Fetch the current title of a Feishu document.
 */
export async function fetchFeishuDocumentTitle(
	cliPath: string,
	docToken: string
): Promise<string> {
	const args = [
		"docs", "+fetch",
		"--api-version", "v2",
		"--doc", docToken,
		"--format", "json",
	];

	const { stdout } = await runCommand(cliPath, args);
	const jsonLine = stdout.split("\n").find(line => line.trim().startsWith("{"));
	if (!jsonLine) {
		throw new LarkCliError("No JSON output from lark-cli docs +fetch");
	}

	const parsed = JSON.parse(jsonLine);
	if (parsed.error) {
		throw new LarkCliError(parsed.error.message || JSON.stringify(parsed.error));
	}

	return parsed.document?.title || "";
}

function escapeXml(str: string): string {
	return str
		.replace(&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lark-cli.ts
git commit -m "feat(lark-cli): add process wrapper for docs +create and +fetch"
```

---

### Task 5: Create Document Creator

**Files:**
- Create: `src/doc-creator.ts`
- Modify: `src/main.ts` (later)

- [ ] **Step 1: Implement modal + orchestration**

```typescript
import { App, Modal, Notice, Setting, TextComponent, TFile, normalizePath } from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import { createFeishuDocument } from "./lark-cli";

export class CreateFeishuDocModal extends Modal {
	private plugin: ObsidianFeishuPlugin;
	private titleInput: TextComponent | undefined;
	private contentInput: TextComponent | undefined;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Create Feishu Document" });

		new Setting(contentEl)
			.setName("Document title")
			.setDesc("Title of the new Feishu document.")
			.addText(text => {
				this.titleInput = text;
				text.setPlaceholder("My Document");
				text.inputEl.style.width = "100%";
			});

		new Setting(contentEl)
			.setName("Initial content (optional)")
			.setDesc("Optional content to include in the document.")
			.addTextArea(textarea => {
				this.contentInput = textarea as unknown as TextComponent;
				textarea.setPlaceholder("Optional content...");
				textarea.inputEl.style.width = "100%";
				textarea.inputEl.style.minHeight = "80px";
			});

		const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });

		const createBtn = btnContainer.createEl("button", { cls: "mod-cta", text: "Create" });
		createBtn.addEventListener("click", () => {
			void this.create();
		});

		const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async create(): Promise<void> {
		const title = this.titleInput?.getValue().trim() ?? "";
		const content = (this.contentInput?.getValue() ?? "").trim();

		if (!title) {
			new Notice("Please enter a document title.");
			return;
		}

		try {
			const docInfo = await createFeishuDocument(
				this.plugin.settings.larkCliPath,
				title,
				content || undefined
			);

			const note = await this.createObsidianNote(docInfo.title, docInfo.docId, docInfo.url);
			if (note) {
				await this.app.workspace.getLeaf().openFile(note);
				if (this.plugin.settings.autoOpenFeishuView) {
					await this.plugin.openFeishuForFile(note);
				}
			}

			new Notice(`Created Feishu document: ${docInfo.title}`);
			this.close();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to create Feishu document: ${msg}`);
			console.error("[obsidian-feishu] create doc error:", err);
		}
	}

	private async createObsidianNote(
		title: string,
		docId: string,
		url: string
	): Promise<TFile | null> {
		const folder = this.plugin.settings.defaultNoteFolder;
		const folderPath = normalizePath(folder);

		// Ensure folder exists
		const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folderExists) {
			await this.app.vault.createFolder(folderPath);
		}

		// Load template if configured
		let body = "";
		const templatePath = this.plugin.settings.noteTemplate;
		if (templatePath) {
			const templateFile = this.app.vault.getAbstractFileByPath(normalizePath(templatePath));
			if (templateFile instanceof TFile) {
				body = await this.app.vault.read(templateFile);
			} else {
				new Notice(`Template not found: ${templatePath}`);
			}
		}

		const frontMatter = [
			"---",
			`feishu_doc_id: ${docId}`,
			`feishu_url: ${url}`,
			`feishu_title: ${title}`,
			"---",
			"",
		].join("\n");

		const content = body ? `${frontMatter}\n${body}` : frontMatter;
		const filePath = normalizePath(`${folderPath}/${this.sanitizeFilename(title)}.md`);

		// Handle collisions
		const finalPath = await this.resolveCollision(filePath);

		return await this.app.vault.create(finalPath, content);
	}

	private sanitizeFilename(name: string): string {
		// Remove characters illegal in most filesystems
		return name.replace(/[\\/:*?"\u003c>|]/g, " ").trim();
	}

	private async resolveCollision(path: string): Promise<string> {
		let candidate = path;
		let counter = 1;
		const base = candidate.replace(/\.md$/, "");

		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = `${base} (${counter}).md`;
			counter++;
		}

		return candidate;
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/doc-creator.ts
git commit -m "feat(doc-creator): add modal to create Feishu docs and Obsidian notes"
```

---

### Task 6: Create Title Sync Module

**Files:**
- Create: `src/title-sync.ts`

- [ ] **Step 1: Implement title fetch + update logic**

```typescript
import { Notice, TFile, normalizePath } from "obsidian";
import type { App } from "obsidian";
import { fetchFeishuDocumentTitle } from "./lark-cli";

export interface TitleSyncOptions {
	cliPath: string;
	syncToFilename: boolean;
}

/**
 * Fetch the latest title from Feishu and update the note's front matter.
 * Optionally rename the file to match.
 */
export async function syncTitle(
	app: App,
	file: TFile,
	options: TitleSyncOptions
): Promise<boolean> {
	const cache = app.metadataCache.getFileCache(file);
	const fm = cache?.frontmatter;
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

	// Update front matter
	await updateFrontMatterTitle(app, file, newTitle);

	// Optionally rename file
	if (options.syncToFilename) {
		const newName = sanitizeFilename(newTitle) + ".md";
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
		// Insert feishu_title before the closing ---
		lines.splice(fmEnd, 0, `feishu_title: ${newTitle}`);
		await app.vault.modify(file, lines.join("\n"));
	}
}

function sanitizeFilename(name: string): string {
	return name.replace(/[\\/:*?"\u003c>|]/g, " ").trim();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/title-sync.ts
git commit -m "feat(title-sync): add title fetch and front matter update"
```

---

### Task 7: Create Base Manager

**Files:**
- Create: `src/base-manager.ts`

- [ ] **Step 1: Implement Base file creation/verification**

```typescript
import { App, normalizePath } from "obsidian";

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

/**
 * Ensure the Feishu Documents.base file exists in the vault root.
 * If it exists, do not overwrite.
 */
export async function ensureBaseFile(app: App): Promise<void> {
	const path = normalizePath(BASE_FILE_NAME);
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) {
		return;
	}
	await app.vault.create(path, BASE_CONTENT);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/base-manager.ts
git commit -m "feat(base-manager): auto-create Feishu Documents.base"
```

---

### Task 8: Refactor main.ts

**Files:**
- Modify: `src/main.ts`
- Delete: `src/index-panel.ts`

- [ ] **Step 1: Rewrite main.ts to wire up all modules**

Replace the entire file with:

```typescript
import { App, Editor, MarkdownView, Modal, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { FeishuDocView, FEISHU_VIEW_TYPE, openFeishuView } from "./feishu-view";
import { FeishuIndexer } from "./indexer";
import { DEFAULT_SETTINGS, FeishuSettingTab, type ObsidianFeishuSettings } from "./settings";
import { parseFeishuUrl } from "./types";
import type { IndexEntry } from "./types";
import { CreateFeishuDocModal } from "./doc-creator";
import { syncTitle } from "./title-sync";
import { ensureBaseFile } from "./base-manager";

export default class ObsidianFeishuPlugin extends Plugin {
	settings!: ObsidianFeishuSettings;
	indexer!: FeishuIndexer;

	async onload() {
		await this.loadSettings();

		this.indexer = new FeishuIndexer(
			this.app,
			() => this.loadData(),
			(data) => this.saveData(data)
		);

		// Register custom view
		this.registerView(
			FEISHU_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new FeishuDocView(leaf)
		);

		// Ribbon icons
		this.addRibbonIcon("globe", "Open Feishu document for current note", () => {
			void this.openFeishuForActiveFile();
		});

		this.addRibbonIcon("file-plus", "Create Feishu document", () => {
			new CreateFeishuDocModal(this.app, this).open();
		});

		// Commands
		this.addCommand({
			id: "open-feishu-doc",
			name: "Open Feishu document for current note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.openFeishuForActiveFile();
				return true;
			},
		});

		this.addCommand({
			id: "create-feishu-document",
			name: "Create Feishu document",
			callback: () => {
				new CreateFeishuDocModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "add-feishu-association",
			name: "Add Feishu association",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.openAssociationModal(file);
				return true;
			},
		});

		this.addCommand({
			id: "remove-feishu-association",
			name: "Remove Feishu association",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.removeAssociation(file);
				return true;
			},
		});

		this.addCommand({
			id: "sync-feishu-title",
			name: "Sync Feishu title now",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.syncTitleForFile(file);
				return true;
			},
		});

		// Settings tab
		this.addSettingTab(new FeishuSettingTab(this.app, this));

		// Auto-open Feishu view + title sync on file open
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				void this.onFileOpen(file);
			})
		);

		// Background sync interval
		this.registerBackgroundSync();

		// Ensure Base file exists
		await ensureBaseFile(this.app);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(FEISHU_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ─── File Open Handler ───

	private async onFileOpen(file: TFile | null): Promise<void> {
		if (!file || file.extension !== "md") return;

		const entry = await this.indexer.getEntryByPath(file.path);
		if (!entry) return;

		if (this.settings.syncTitle) {
			await this.syncTitleForFile(file);
		}

		if (this.settings.autoOpenFeishuView) {
			await openFeishuView(this.app, entry);
		}
	}

	// ─── Title Sync ───

	private async syncTitleForFile(file: TFile): Promise<void> {
		try {
			const changed = await syncTitle(this.app, file, {
				cliPath: this.settings.larkCliPath,
				syncToFilename: this.settings.syncTitleToFilename,
			});
			if (changed) {
				new Notice(`Synced Feishu title for ${file.name}`);
			}
		} catch (err) {
			console.error("[obsidian-feishu] sync title error:", err);
		}
	}

	// ─── Background Sync ───

	private registerBackgroundSync(): void {
		const minutes = this.settings.syncIntervalMinutes;
		if (minutes <= 0) return;

		const ms = minutes * 60 * 1000;
		this.registerInterval(
			window.setInterval(() => {
				void this.runBackgroundSync();
			}, ms)
		);
	}

	private async runBackgroundSync(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (cache?.frontmatter?.feishu_doc_id) {
				try {
					await syncTitle(this.app, file, {
						cliPath: this.settings.larkCliPath,
						syncToFilename: this.settings.syncTitleToFilename,
					});
				} catch {
					// Silent fail for background sync
				}
			}
		}
	}

	// ─── Open Feishu View ───

	private async openFeishuForActiveFile(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file.");
			return;
		}
		await this.openFeishuForFile(file);
	}

	async openFeishuForFile(file: TFile): Promise<void> {
		const entry = await this.indexer.getEntryByPath(file.path);
		if (!entry) {
			new Notice("This note is not associated with a Feishu document.");
			return;
		}
		await openFeishuView(this.app, entry);
	}

	// ─── Association Modal (existing) ───

	private async openAssociationModal(file: TFile): Promise<void> {
		new AssociationModal(this.app, file, this).open();
	}

	// ─── Remove Association (existing) ───

	private async removeAssociation(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const lines = content.split("\n");
		let inFm = false;
		let fmStart = -1;
		let fmEnd = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			if (i === 0 && line.trim() === "---") {
				inFm = true;
				fmStart = i;
				continue;
			}
			if (inFm && line.trim() === "---") {
				inFm = false;
				fmEnd = i;
				break;
			}
		}

		if (fmStart === -1 || fmEnd === -1) {
			new Notice("No front matter found.");
			return;
		}

		const keptLines: string[] = [];
		for (let i = fmStart + 1; i < fmEnd; i++) {
			const line = lines[i]!;
			const key = line.split(":")[0]?.trim();
			if (key !== "feishu_doc_id" && key !== "feishu_url" && key !== "feishu_title") {
				keptLines.push(line);
			}
		}

		const bodyLines = lines.slice(fmEnd + 1);
		const newContent = keptLines.length > 0
			? ["---", ...keptLines, "---", ...bodyLines].join("\n")
			: bodyLines.join("\n");

		await this.app.vault.modify(file, newContent);
		new Notice(`Removed Feishu association from ${file.name}`);
	}
}

// ─── Association Modal (retained for manual linking) ───

class AssociationModal extends Modal {
	private file: TFile;
	private plugin: ObsidianFeishuPlugin;
	private urlInput: HTMLInputElement | undefined;
	private titleInput: HTMLInputElement | undefined;

	constructor(app: App, file: TFile, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.file = file;
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add Feishu Association" });

		const urlWrap = contentEl.createDiv();
		urlWrap.createEl("label", { text: "Feishu document URL" });
		this.urlInput = urlWrap.createEl("input", { type: "text" });
		this.urlInput.style.width = "100%";
		this.urlInput.placeholder = "https://www.feishu.cn/docs/...";

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", { text: "Document title (optional)" });
		this.titleInput = titleWrap.createEl("input", { type: "text" });
		this.titleInput.style.width = "100%";
		this.titleInput.placeholder = "My Feishu Doc";

		const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });
		const saveBtn = btnContainer.createEl("button", { cls: "mod-cta", text: "Save" });
		saveBtn.addEventListener("click", () => {
			void this.save();
		});
		const cancelBtn = btnContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const url = this.urlInput?.value.trim() ?? "";
		const title = this.titleInput?.value.trim() ?? "";

		if (!url) {
			new Notice("Please enter a Feishu URL.");
			return;
		}

		const parsed = parseFeishuUrl(url);
		if (!parsed) {
			new Notice("Invalid Feishu URL.");
			return;
		}

		await this.updateFrontMatter(parsed.docId, parsed.url, title || undefined);
		new Notice(`Feishu association saved for ${this.file.name}`);
		this.close();
	}

	private async updateFrontMatter(
		docId: string,
		url: string,
		title?: string
	): Promise<void> {
		const content = await this.app.vault.read(this.file);
		const lines = content.split("\n");
		let inFm = false;
		let fmStart = -1;
		let fmEnd = -1;
		const fmMap = new Map<string, string>();
		const bodyLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			if (i === 0 && line.trim() === "---") {
				inFm = true;
				fmStart = i;
				continue;
			}
			if (inFm && line.trim() === "---") {
				inFm = false;
				fmEnd = i;
				continue;
			}
			if (inFm) {
				const idx = line.indexOf(":");
				if (idx > 0) {
					fmMap.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
				}
			} else {
				bodyLines.push(line);
			}
		}

		fmMap.set("feishu_doc_id", docId);
		fmMap.set("feishu_url", url);
		if (title) fmMap.set("feishu_title", title);

		const newFm = Array.from(fmMap.entries()).map(([k, v]) => `${k}: ${v}`);
		const newContent = fmStart !== -1
			? ["---", ...newFm, "---", ...bodyLines].join("\n")
			: ["---", ...newFm, "---", "", ...bodyLines].join("\n");

		await this.app.vault.modify(this.file, newContent);
	}
}
```

- [ ] **Step 2: Delete index-panel.ts**

```bash
rm /Users/onee/Code/onee-workspace/projects/personal/obsidian-feishu/src/index-panel.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/main.ts src/index-panel.ts
git commit -m "feat(main): wire up doc creator, title sync, base manager; remove index panel"
```

---

### Task 9: Update feishu-view.ts

**Files:**
- Modify: `src/feishu-view.ts`

- [ ] **Step 1: Minor cleanup — use Obsidian CSS variables, no bare DOM refs**

Replace the entire file with:

```typescript
import { App, ItemView, WorkspaceLeaf } from "obsidian";
import type { IndexEntry } from "./types";

export const FEISHU_VIEW_TYPE = "feishu-doc-view";

/**
 * A view that embeds a Feishu document in an iframe.
 * Desktop-only plugin; iframe is used for preview.
 */
export class FeishuDocView extends ItemView {
	private currentUrl: string | undefined;
	private currentTitle: string | undefined;

	getViewType(): string {
		return FEISHU_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.currentTitle ? `Feishu: ${this.currentTitle}` : "Feishu Document";
	}

	getIcon(): string {
		return "globe";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("feishu-doc-view");
		this.renderEmptyState();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	async loadEntry(entry: IndexEntry): Promise<void> {
		this.currentUrl = entry.feishu_url;
		this.currentTitle = entry.feishu_title ?? entry.feishu_doc_id;
		this.renderIframe();
	}

	async loadUrl(url: string, title?: string): Promise<void> {
		this.currentUrl = url;
		this.currentTitle = title ?? "Feishu Document";
		this.renderIframe();
	}

	clear(): void {
		this.currentUrl = undefined;
		this.currentTitle = undefined;
		this.renderEmptyState();
	}

	private renderEmptyState(): void {
		this.contentEl.empty();
		const container = this.contentEl.createDiv({ cls: "feishu-doc-empty" });
		container.createEl("p", {
			text: "Open a note with Feishu front matter to view the document here.",
		});
	}

	private renderIframe(): void {
		if (!this.currentUrl) {
			this.renderEmptyState();
			return;
		}
		this.contentEl.empty();
		const iframe = this.contentEl.createEl("iframe", { cls: "feishu-doc-iframe" });
		iframe.src = this.currentUrl;
		iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
		iframe.style.width = "100%";
		iframe.style.height = "100%";
		iframe.style.border = "none";
	}
}

export async function openFeishuView(
	app: App,
	entry: IndexEntry
): Promise<void> {
	const leaves = app.workspace.getLeavesOfType(FEISHU_VIEW_TYPE);
	if (leaves.length > 0) {
		const leaf = leaves[0]!;
		const view = leaf.view as FeishuDocView;
		await view.loadEntry(entry);
		await app.workspace.revealLeaf(leaf);
	} else {
		const leaf = app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({ type: FEISHU_VIEW_TYPE, active: true });
		const view = leaf.view as FeishuDocView;
		await view.loadEntry(entry);
		await app.workspace.revealLeaf(leaf);
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/feishu-view.ts
git commit -m "refactor(feishu-view): cleanup, use createEl consistently"
```

---

### Task 10: Build and Verify

**Files:**
- Modify: `src/indexer.ts` (simplify if needed)

- [ ] **Step 1: Simplify indexer.ts — remove save/load, keep read/scan only**

Replace with:

```typescript
import { App, TFile } from "obsidian";
import type { FeishuFrontMatter, IndexEntry } from "./types";
import { extractDocIdFromUrl, normalizeFeishuUrl } from "./types";

/**
 * Reads front matter and scans vault for Feishu-associated notes.
 * No longer persists an index — Base handles the global view.
 */
export class FeishuIndexer {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	async readFrontMatter(file: TFile): Promise<FeishuFrontMatter | undefined> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return undefined;

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

		return result.feishu_doc_id || result.feishu_url ? result : undefined;
	}

	async hasFeishuAssociation(file: TFile): Promise<boolean> {
		return !!(await this.readFrontMatter(file));
	}

	async getEntryByPath(path: string): Promise<IndexEntry | undefined> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return undefined;

		const fm = await this.readFrontMatter(file);
		if (!fm) return undefined;

		const docId = fm.feishu_doc_id ?? extractDocIdFromUrl(fm.feishu_url ?? "") ?? "";
		const url = fm.feishu_url ?? (docId ? `https://www.feishu.cn/docs/${docId}` : "");

		if (!docId || !url) return undefined;

		return {
			path: file.path,
			feishu_doc_id: docId,
			feishu_url: normalizeFeishuUrl(url),
			feishu_title: fm.feishu_title,
			mtime: file.stat.mtime,
		};
	}
}
```

- [ ] **Step 2: Update main.ts indexer instantiation** (remove loadData/saveData params)

In `src/main.ts`, change:
```typescript
this.indexer = new FeishuIndexer(this.app);
```

- [ ] **Step 3: Build**

```bash
cd /Users/onee/Code/onee-workspace/projects/personal/obsidian-feishu
npm run build
```

Expected: No TypeScript errors. `main.js` generated.

- [ ] **Step 4: Commit**

```bash
git add src/indexer.ts src/main.ts
git commit -m "refactor(indexer): remove persisted index, simplify to front matter reader"
```

---

### Task 11: Final Integration Test

- [ ] **Step 1: Copy artifacts to test vault**

```bash
# Adjust destination to your test vault
VAULT="$HOME/Documents/Obsidian/TestVault/.obsidian/plugins/obsidian-feishu"
mkdir -p "$VAULT"
cp manifest.json main.js styles.css "$VAULT/"
```

- [ ] **Step 2: Manual checklist**

| Check | Expected |
|-------|----------|
| Enable plugin | Loads without error |
| Settings panel | Shows Lark CLI path, folder, sync toggles |
| "Create Feishu document" command | Modal opens, asks for title |
| Create with valid title | Feishu doc created, note appears in `Feishu/` folder with front matter |
| Open linked note | Feishu preview opens in right sidebar |
| `Feishu Documents.base` | Exists in vault root, lists all linked notes |
| Change title in Feishu, reopen note | Front matter updates, notice shown |

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration test fixes" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec coverage:**
- FR-1 Create Feishu doc → Task 4 + Task 5 ✓
- FR-2 Inline preview → Task 8 (already existed, wired) + Task 9 ✓
- FR-3 Title sync → Task 6 + Task 8 ✓
- FR-4 Base integration → Task 7 ✓
- FR-5 Settings → Task 2 ✓
- FR-6 Note template → Task 5 (`createObsidianNote`) ✓

**2. Placeholder scan:**
- No TBD/TODO/"implement later" found ✓
- No vague "add error handling" without code ✓
- All tasks include exact file paths and code ✓

**3. Type consistency:**
- `FeishuDocInfo` used in `lark-cli.ts` and `doc-creator.ts` ✓
- `syncTitle` signature consistent in `title-sync.ts` and `main.ts` ✓
- `IndexEntry` from `types.ts` used in `indexer.ts` and `feishu-view.ts` ✓

---

## Execution Handoff

**Plan complete and saved to `doc/superpowers/plans/2026-05-17-obsidian-feishu-core.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
