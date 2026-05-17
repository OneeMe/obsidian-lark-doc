import {App, ItemView, WorkspaceLeaf} from "obsidian";
import type {IndexEntry} from "./types";

export const FEISHU_VIEW_TYPE = "feishu-doc-view";

interface WebviewLike {
	src: string;
	style: CSSStyleDeclaration;
	addEventListener(type: "dom-ready", listener: () => void): void;
	insertCSS(css: string): Promise<string>;
	removeInsertedCSS(key: string): Promise<void>;
}

const HIDE_HEADER_CSS = `
/* Hide Feishu doc top navigation */
.feishu-doc-view .header,
.feishu-doc-view .nav,
.feishu-doc-view .doc-nav,
.feishu-doc-view .lark-doc-header,
.feishu-doc-view [class*="header"],
.feishu-doc-view [class*="navBar"],
.feishu-doc-view [class*="navbar"] {
	display: none !important;
}
`;

export class FeishuDocView extends ItemView {
	private currentUrl: string | undefined;
	private currentTitle: string | undefined;
	private webviewEl: WebviewLike | undefined;
	private zoomLevel = 1.0;
	private cssKey: string | undefined;

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

	async loadEntry(entry: IndexEntry, options?: FrameOptions): Promise<void> {
		this.currentUrl = entry.feishu_url;
		this.currentTitle = entry.feishu_title ?? entry.feishu_doc_id;
		this.zoomLevel = options?.zoom ?? 1.0;
		this.renderWebview(options);
	}

	async loadUrl(url: string, title?: string, options?: FrameOptions): Promise<void> {
		this.currentUrl = url;
		this.currentTitle = title ?? "Feishu Document";
		this.zoomLevel = options?.zoom ?? 1.0;
		this.renderWebview(options);
	}

	clear(): void {
		this.currentUrl = undefined;
		this.currentTitle = undefined;
		this.renderEmptyState();
	}

	setZoom(zoom: number): void {
		this.zoomLevel = zoom;
		if (this.webviewEl) {
			this.applyZoom();
		}
	}

	async injectCss(customCss: string, hideHeader: boolean): Promise<void> {
		if (!this.webviewEl) return;

		// Remove previous CSS
		if (this.cssKey) {
			try {
				await this.webviewEl.removeInsertedCSS(this.cssKey);
			} catch {
				// ignore
			}
			this.cssKey = undefined;
		}

		const css = (hideHeader ? HIDE_HEADER_CSS : "") + "\n" + (customCss || "");
		if (!css.trim()) return;

		try {
			this.cssKey = await this.webviewEl.insertCSS(css);
		} catch {
			// webview may not support insertCSS; ignore
		}
	}

	private renderEmptyState(): void {
		this.contentEl.empty();
		this.webviewEl = undefined;
		const container = this.contentEl.createDiv({cls: "feishu-doc-empty"});
		container.createEl("p", {
			text: "Open a note with Feishu front matter to view the document here.",
		});
	}

	private renderWebview(options?: FrameOptions): void {
		if (!this.currentUrl) {
			this.renderEmptyState();
			return;
		}
		this.contentEl.empty();

		// Create a zoom container
		const zoomContainer = this.contentEl.createDiv({cls: "feishu-doc-zoom-container"});
		zoomContainer.style.width = "100%";
		zoomContainer.style.height = "100%";
		zoomContainer.style.overflow = "auto";

		// Use webview on desktop, iframe as fallback
		const useWebview = this.isWebviewAvailable();
		let el: HTMLElement;

		if (useWebview) {
			el = document.createElement("webview") as HTMLElement;
			el.addClass("feishu-doc-webview");
			zoomContainer.appendChild(el);
			el.setAttribute("partition", "persist:feishu-vault");
			el.setAttribute("nodeintegration", "false");
			el.setAttribute("contextisolation", "true");
			el.setAttribute("allowpopups", "");
			(el as unknown as WebviewLike).src = this.currentUrl;
			this.webviewEl = el as unknown as WebviewLike;
		} else {
			el = zoomContainer.createEl("iframe", {cls: "feishu-doc-iframe"});
			(el as HTMLIFrameElement).src = this.currentUrl;
			(el as HTMLIFrameElement).setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");
		}

		el.style.width = "100%";
		el.style.height = "100%";
		el.style.border = "none";

		this.applyZoom();

		if (useWebview && this.webviewEl) {
			this.webviewEl.addEventListener("dom-ready", () => {
				void this.injectCss(options?.customCss ?? "", options?.hideHeader ?? true);
			});
		}
	}

	private applyZoom(): void {
		if (this.zoomLevel === 1.0) return;
		// Apply zoom via CSS on the container, not the webview itself
		const container = this.contentEl.querySelector(".feishu-doc-zoom-container") as HTMLElement | null;
		if (container) {
			container.style.transform = `scale(${this.zoomLevel})`;
			container.style.transformOrigin = "0 0";
			container.style.width = `${100 / this.zoomLevel}%`;
			container.style.height = `${100 / this.zoomLevel}%`;
		}
	}

	private isWebviewAvailable(): boolean {
		// @ts-expect-error webview is available in Electron desktop
		return typeof document?.createElement("webview")?.src !== "undefined";
	}
}

export interface FrameOptions {
	zoom?: number;
	customCss?: string;
	hideHeader?: boolean;
}

export async function openFeishuView(
	app: App,
	entry: IndexEntry,
	options?: FrameOptions
): Promise<void> {
	const leaves = app.workspace.getLeavesOfType(FEISHU_VIEW_TYPE);
	if (leaves.length > 0) {
		const leaf = leaves[0]!;
		const view = leaf.view as FeishuDocView;
		await view.loadEntry(entry, options);
		await app.workspace.revealLeaf(leaf);
	} else {
		const leaf = app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({type: FEISHU_VIEW_TYPE, active: true});
		const view = leaf.view as FeishuDocView;
		await view.loadEntry(entry, options);
		await app.workspace.revealLeaf(leaf);
	}
}
