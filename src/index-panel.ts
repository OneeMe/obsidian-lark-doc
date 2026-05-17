import {ItemView, WorkspaceLeaf, TFile, setIcon} from "obsidian";
import type {FeishuIndexer} from "./indexer";
import type {IndexEntry} from "./types";
import {openFeishuView} from "./feishu-view";

export const FEISHU_INDEX_PANEL_TYPE = "feishu-index-panel";

/**
 * A sidebar panel that lists all Feishu-associated notes in the vault.
 */
export class FeishuIndexPanel extends ItemView {
	private indexer: FeishuIndexer;
	private entries: IndexEntry[] = [];
	private listContainer: HTMLElement | undefined;

	getViewType(): string {
		return FEISHU_INDEX_PANEL_TYPE;
	}

	getDisplayText(): string {
		return "Feishu Index";
	}

	getIcon(): string {
		return "list";
	}

	constructor(leaf: WorkspaceLeaf, indexer: FeishuIndexer) {
		super(leaf);
		this.indexer = indexer;
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("feishu-index-panel");
		this.renderHeader();
		this.listContainer = this.contentEl.createDiv({cls: "feishu-index-list"});
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	private renderHeader(): void {
		const header = this.contentEl.createDiv({cls: "feishu-index-header"});
		header.createEl("h4", {text: "Feishu Documents"});

		const actions = header.createDiv({cls: "feishu-index-actions"});

		const refreshBtn = actions.createEl("button", {
			cls: "clickable-icon",
			attr: {"aria-label": "Refresh index"},
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => {
			void this.refresh();
		});
	}

	async refresh(): Promise<void> {
		this.entries = await this.indexer.rebuildIndex();
		this.renderList();
	}

	private renderList(): void {
		if (!this.listContainer) {
			return;
		}
		this.listContainer.empty();

		if (this.entries.length === 0) {
			this.listContainer.createEl("p", {
				cls: "feishu-index-empty",
				text: "No Feishu-associated notes found. Use the command \"Add Feishu association\" to link a note.",
			});
			return;
		}

		for (const entry of this.entries) {
			const item = this.listContainer.createDiv({cls: "feishu-index-item"});

			const titleEl = item.createEl("div", {cls: "feishu-index-item-title"});
			titleEl.setText(entry.feishu_title ?? entry.feishu_doc_id);

			const metaEl = item.createEl("div", {cls: "feishu-index-item-meta"});
			metaEl.setText(entry.path);

			item.addEventListener("click", (evt) => {
				evt.preventDefault();
				void this.openEntry(entry);
			});
		}
	}

	private async openEntry(entry: IndexEntry): Promise<void> {
		// Open the markdown file
		const file = this.app.vault.getAbstractFileByPath(entry.path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		}
		// Open the Feishu view
		await openFeishuView(this.app, entry);
	}
}
