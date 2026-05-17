import {
	App,
	Modal,
	Notice,
	Plugin,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import {FeishuDocView, FEISHU_VIEW_TYPE, openFeishuView} from "./feishu-view";
import {FeishuIndexer} from "./indexer";
import {
	DEFAULT_SETTINGS,
	FeishuSettingTab,
	type ObsidianFeishuSettings,
} from "./settings";
import {parseFeishuUrl} from "./types";
import {CreateFeishuDocModal} from "./doc-creator";
import {syncTitle} from "./title-sync";
import {ensureBaseFile} from "./base-manager";

export default class ObsidianFeishuPlugin extends Plugin {
	settings!: ObsidianFeishuSettings;
	indexer!: FeishuIndexer;

	async onload() {
		await this.loadSettings();

		this.indexer = new FeishuIndexer(this.app);

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

	// --- File Open Handler ---

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

	// --- Title Sync ---

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

	// --- Background Sync ---

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

	// --- Open Feishu View ---

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

	// --- Association Modal (existing) ---

	private async openAssociationModal(file: TFile): Promise<void> {
		new AssociationModal(this.app, file, this).open();
	}

	// --- Remove Association (existing) ---

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

// --- Association Modal (retained for manual linking) ---

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
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Add Feishu Association"});

		const urlWrap = contentEl.createDiv();
		urlWrap.createEl("label", {text: "Feishu document URL"});
		this.urlInput = urlWrap.createEl("input", {type: "text"});
		this.urlInput.style.width = "100%";
		this.urlInput.placeholder = "https://www.feishu.cn/docs/...";

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", {text: "Document title (optional)"});
		this.titleInput = titleWrap.createEl("input", {type: "text"});
		this.titleInput.style.width = "100%";
		this.titleInput.placeholder = "My Feishu Doc";

		const btnContainer = contentEl.createDiv({cls: "modal-button-container"});
		const saveBtn = btnContainer.createEl("button", {cls: "mod-cta", text: "Save"});
		saveBtn.addEventListener("click", () => {
			void this.save();
		});
		const cancelBtn = btnContainer.createEl("button", {text: "Cancel"});
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
