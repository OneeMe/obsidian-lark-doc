import {App, ItemView, WorkspaceLeaf, TFile} from "obsidian";
import type {IndexEntry} from "./types";

export const FEISHU_VIEW_TYPE = "feishu-doc-view";

/**
 * A view that embeds a Feishu document in an iframe.
 * Mobile-compatible — uses iframe instead of Electron webview.
 */
export class FeishuDocView extends ItemView {
	private currentUrl: string | undefined;
	private currentTitle: string | undefined;
	private iframeEl: HTMLIFrameElement | undefined;

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

	/**
	 * Load a Feishu document into the view.
	 */
	async loadEntry(entry: IndexEntry): Promise<void> {
		this.currentUrl = entry.feishu_url;
		this.currentTitle = entry.feishu_title ?? entry.feishu_doc_id;
		this.renderIframe();
	}

	/**
	 * Load a Feishu document by URL directly.
	 */
	async loadUrl(url: string, title?: string): Promise<void> {
		this.currentUrl = url;
		this.currentTitle = title ?? "Feishu Document";
		this.renderIframe();
	}

	/**
	 * Clear the view and show empty state.
	 */
	clear(): void {
		this.currentUrl = undefined;
		this.currentTitle = undefined;
		this.renderEmptyState();
	}

	private renderEmptyState(): void {
		this.contentEl.empty();
		const container = this.contentEl.createDiv({cls: "feishu-doc-empty"});
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
		this.iframeEl = this.contentEl.createEl("iframe", {
			cls: "feishu-doc-iframe",
		});
		this.iframeEl.src = this.currentUrl;
		this.iframeEl.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
		// Ensure the iframe fills the container
		this.iframeEl.style.width = "100%";
		this.iframeEl.style.height = "100%";
		this.iframeEl.style.border = "none";
	}
}

/**
 * Open or focus a Feishu document view for the given entry.
 */
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
		if (!leaf) {
			return;
		}
		await leaf.setViewState({
			type: FEISHU_VIEW_TYPE,
			active: true,
		});
		const view = leaf.view as FeishuDocView;
		await view.loadEntry(entry);
		await app.workspace.revealLeaf(leaf);
	}
}
