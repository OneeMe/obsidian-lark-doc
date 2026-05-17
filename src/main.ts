import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TextComponent,
	WorkspaceLeaf,
} from "obsidian";
import {FeishuDocView, FEISHU_VIEW_TYPE, openFeishuView} from "./feishu-view";
import {FeishuIndexPanel, FEISHU_INDEX_PANEL_TYPE} from "./index-panel";
import {FeishuIndexer} from "./indexer";
import {
	DEFAULT_SETTINGS,
	FeishuSettingTab,
	type ObsidianFeishuSettings,
} from "./settings";
import {parseFeishuUrl} from "./types";
import type {IndexEntry} from "./types";

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

		// Register custom views
		this.registerView(
			FEISHU_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new FeishuDocView(leaf)
		);

		this.registerView(
			FEISHU_INDEX_PANEL_TYPE,
			(leaf: WorkspaceLeaf) => new FeishuIndexPanel(leaf, this.indexer)
		);

		// Ribbon icons
		this.addRibbonIcon("globe", "Open Feishu document", (evt) => {
			void this.openFeishuForActiveFile();
		});

		this.addRibbonIcon("list", "Open Feishu index", (evt) => {
			void this.openIndexPanel();
		});

		// Commands
		this.addCommand({
			id: "open-feishu-doc",
			name: "Open Feishu document for current note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") {
					return false;
				}
				if (!checking) {
					void this.openFeishuForActiveFile();
				}
				return true;
			},
		});

		this.addCommand({
			id: "add-feishu-association",
			name: "Add / update Feishu association",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") {
					return false;
				}
				if (!checking) {
					void this.openAssociationModal(file);
				}
				return true;
			},
		});

		this.addCommand({
			id: "remove-feishu-association",
			name: "Remove Feishu association",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") {
					return false;
				}
				if (!checking) {
					void this.removeAssociation(file);
				}
				return true;
			},
		});

		this.addCommand({
			id: "rebuild-feishu-index",
			name: "Rebuild Feishu index",
			callback: () => {
				void this.rebuildIndex();
			},
		});

		this.addCommand({
			id: "open-feishu-index-panel",
			name: "Open Feishu index panel",
			callback: () => {
				void this.openIndexPanel();
			},
		});

		// Settings tab
		this.addSettingTab(new FeishuSettingTab(this.app, this));

		// Event: auto-open Feishu view when a file with association is opened
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				void this.onFileOpen(file);
			})
		);

		// Initial index rebuild
		await this.indexer.rebuildIndex();

		// Show index panel if configured
		if (this.settings.showIndexPanel) {
			void this.openIndexPanel();
		}
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(FEISHU_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(FEISHU_INDEX_PANEL_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Handle file-open event: auto-open Feishu view for associated notes.
	 */
	private async onFileOpen(file: TFile | null): Promise<void> {
		if (!this.settings.autoOpenFeishuView || !file || file.extension !== "md") {
			return;
		}
		const entry = await this.indexer.getEntryByPath(file.path);
		if (entry) {
			await openFeishuView(this.app, entry);
		}
	}

	/**
	 * Open Feishu view for the currently active file.
	 */
	private async openFeishuForActiveFile(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file.");
			return;
		}
		const entry = await this.indexer.getEntryByPath(file.path);
		if (!entry) {
			new Notice("This note is not associated with a Feishu document.");
			return;
		}
		await openFeishuView(this.app, entry);
	}

	/**
	 * Open the association modal for a file.
	 */
	private async openAssociationModal(file: TFile): Promise<void> {
		new AssociationModal(this.app, file, this).open();
	}

	/**
	 * Remove Feishu front matter from a file.
	 */
	private async removeAssociation(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const lines = content.split("\n");
		let inFrontMatter = false;
		let frontMatterStart = -1;
		let frontMatterEnd = -1;
		const newLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			if (i === 0 && line.trim() === "---") {
				inFrontMatter = true;
				frontMatterStart = i;
				continue;
			}
			if (inFrontMatter && line.trim() === "---") {
				inFrontMatter = false;
				frontMatterEnd = i;
				continue;
			}
			if (inFrontMatter) {
				const key = line.split(":")[0]?.trim();
				if (
					key === "feishu_doc_id" ||
					key === "feishu_url" ||
					key === "feishu_title"
				) {
					continue;
				}
			}
			if (!inFrontMatter && frontMatterEnd === -1) {
				// No front matter at all, just keep everything
				newLines.push(line);
			} else if (!inFrontMatter) {
				newLines.push(line);
			} else {
				newLines.push(line);
			}
		}

		// Rebuild front matter if we have one
		if (frontMatterStart !== -1 && frontMatterEnd !== -1) {
			const frontMatterLines: string[] = [];
			for (let i = frontMatterStart + 1; i < frontMatterEnd; i++) {
				const line = lines[i]!;
				const key = line.split(":")[0]?.trim();
				if (
					key !== "feishu_doc_id" &&
					key !== "feishu_url" &&
					key !== "feishu_title"
				) {
					frontMatterLines.push(line);
				}
			}
			const bodyLines = lines.slice(frontMatterEnd + 1);
			if (frontMatterLines.length > 0) {
				const newContent = ["---", ...frontMatterLines, "---", ...bodyLines].join("\n");
				await this.app.vault.modify(file, newContent);
			} else {
				const newContent = bodyLines.join("\n");
				await this.app.vault.modify(file, newContent);
			}
		}

		new Notice(`Removed Feishu association from ${file.name}`);
		await this.indexer.rebuildIndex();
	}

	/**
	 * Rebuild the Feishu index.
	 */
	private async rebuildIndex(): Promise<void> {
		await this.indexer.rebuildIndex();
		new Notice("Feishu index rebuilt.");
	}

	/**
	 * Open the Feishu index panel in the left sidebar.
	 */
	private async openIndexPanel(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(FEISHU_INDEX_PANEL_TYPE);
		if (leaves.length > 0) {
			await this.app.workspace.revealLeaf(leaves[0]!);
			return;
		}
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (!leaf) {
			return;
		}
		await leaf.setViewState({
			type: FEISHU_INDEX_PANEL_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(leaf);
	}
}

/**
 * Modal to add or update a Feishu association for the current note.
 */
class AssociationModal extends Modal {
	private file: TFile;
	private plugin: ObsidianFeishuPlugin;
	private urlInput: TextComponent | undefined;
	private titleInput: TextComponent | undefined;

	constructor(app: App, file: TFile, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.file = file;
		this.plugin = plugin;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Add / Update Feishu Association"});

		// URL input
		const urlSetting = new Setting(contentEl)
			.setName("Feishu document URL")
			.setDesc("Paste the full Feishu document URL.");
		this.urlInput = new TextComponent(urlSetting.controlEl);
		this.urlInput.setPlaceholder("https://www.feishu.cn/docs/...");
		this.urlInput.inputEl.style.width = "100%";

		// Title input
		const titleSetting = new Setting(contentEl)
			.setName("Document title (optional)")
			.setDesc("A human-readable title for the Feishu document.");
		this.titleInput = new TextComponent(titleSetting.controlEl);
		this.titleInput.setPlaceholder("My Feishu Doc");
		this.titleInput.inputEl.style.width = "100%";

		// Buttons
		const buttonContainer = contentEl.createDiv({cls: "modal-button-container"});
		const saveBtn = buttonContainer.createEl("button", {
			cls: "mod-cta",
			text: "Save",
		});
		saveBtn.addEventListener("click", () => {
			void this.save();
		});

		const cancelBtn = buttonContainer.createEl("button", {
			text: "Cancel",
		});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const url = this.urlInput?.getValue().trim() ?? "";
		const title = this.titleInput?.getValue().trim() ?? "";

		if (!url) {
			new Notice("Please enter a Feishu URL.");
			return;
		}

		const parsed = parseFeishuUrl(url);
		if (!parsed) {
			new Notice("Invalid Feishu URL. Please check and try again.");
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
		let inFrontMatter = false;
		let frontMatterStart = -1;
		let frontMatterEnd = -1;
		const frontMatterMap = new Map<string, string>();
		const bodyLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i]!;
			if (i === 0 && line.trim() === "---") {
				inFrontMatter = true;
				frontMatterStart = i;
				continue;
			}
			if (inFrontMatter && line.trim() === "---") {
				inFrontMatter = false;
				frontMatterEnd = i;
				continue;
			}
			if (inFrontMatter) {
				const colonIndex = line.indexOf(":");
				if (colonIndex > 0) {
					const key = line.slice(0, colonIndex).trim();
					const value = line.slice(colonIndex + 1).trim();
					frontMatterMap.set(key, value);
				}
			} else {
				bodyLines.push(line);
			}
		}

		// Update / add Feishu fields
		frontMatterMap.set("feishu_doc_id", docId);
		frontMatterMap.set("feishu_url", url);
		if (title) {
			frontMatterMap.set("feishu_title", title);
		}

		const newFrontMatterLines: string[] = [];
		for (const [key, value] of frontMatterMap) {
			newFrontMatterLines.push(`${key}: ${value}`);
		}

		const newContent =
			frontMatterStart !== -1
				? ["---", ...newFrontMatterLines, "---", ...bodyLines].join("\n")
				: ["---", ...newFrontMatterLines, "---", "", ...bodyLines].join("\n");

		await this.app.vault.modify(this.file, newContent);
		await this.plugin.indexer.rebuildIndex();
	}
}
