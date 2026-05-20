import {App, FileView, MarkdownView, Notice, TFile, ViewStateResult, WorkspaceLeaf} from "obsidian";
import type {IndexEntry} from "./types";
import {readFeishuFrontMatter} from "./feishu-frontmatter";
import {translate, type TranslationKey, type TranslationVars, type Translator} from "./i18n";

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

export class FeishuDocView extends FileView {
	navigation = false;
	private currentUrl: string | undefined;
	private currentTitle: string | undefined;
	private currentSourcePath: string | undefined;
	private currentZoom = 1.0;
	private currentCustomCss = "";
	private currentHideHeader = true;
	private webviewEl: WebviewLike | undefined;
	private zoomLevel = 1.0;
	private cssKey: string | undefined;
	private syncActionEl: HTMLElement | undefined;
	private options: FeishuDocViewOptions;

	constructor(leaf: WorkspaceLeaf, options: FeishuDocViewOptions = {}) {
		super(leaf);
		this.options = options;
	}

	getViewType(): string {
		return FEISHU_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.currentTitle
			? this.t("view.displayPrefix", {title: this.currentTitle})
			: this.t("view.defaultTitle");
	}

	getIcon(): string {
		return "globe";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("feishu-doc-view");

		if (!this.syncActionEl) {
			this.syncActionEl = this.addAction("refresh-cw", this.t("view.syncAction"), () => {
				void this.syncCurrentFile();
			});
		}

		// FileView sets this.file before onOpen runs; load it now.
		if (this.file) {
			await this.loadFile(this.file);
		} else {
			this.renderEmptyState();
		}
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	/**
	 * Called by Obsidian when a file is loaded into this FileView.
	 */
	async onLoadFile(file: TFile): Promise<void> {
		await this.loadFile(file);
	}

	private async loadFile(file: TFile): Promise<void> {
		this.currentSourcePath = file.path;
		const fm = await readFeishuFrontMatter(this.app, file);
		const url = fm?.feishu_url;
		if (url) {
			this.currentTitle = fm.feishu_title || file.basename;
			await this.loadUrl(url, this.currentTitle);
		} else {
			this.renderEmptyState();
		}
	}

	async loadEntry(entry: IndexEntry, options?: FrameOptions): Promise<void> {
		this.currentSourcePath = entry.path;
		await this.loadUrl(entry.feishu_url, entry.feishu_title ?? entry.feishu_doc_id, options);
	}

	async loadUrl(url: string, title?: string, options?: FrameOptions): Promise<void> {
		this.currentUrl = url;
		this.currentTitle = title ?? this.t("view.defaultTitle");
		this.currentZoom = options?.zoom ?? 1.0;
		this.currentCustomCss = options?.customCss ?? "";
		this.currentHideHeader = options?.hideHeader ?? true;
		this.zoomLevel = this.currentZoom;
		this.renderWebview(options);
	}

	getState(): Record<string, unknown> {
		const state = Object.assign(super.getState(), {
			url: this.currentUrl,
			title: this.currentTitle,
			sourcePath: this.currentSourcePath,
			zoom: this.currentZoom,
			customCss: this.currentCustomCss,
			hideHeader: this.currentHideHeader,
		});
		if (this.currentSourcePath) {
			state.file = this.currentSourcePath;
		}
		return state;
	}

	async setState(state: Record<string, unknown>, result: ViewStateResult): Promise<void> {
		const filePath = typeof state.file === "string" ? state.file : undefined;
		if (filePath) {
			await super.setState(state, result);
		}

		const url = state.url as string | undefined;
		const title = state.title as string | undefined;
		this.currentSourcePath = (state.sourcePath as string | undefined) ?? filePath;
		const zoom = state.zoom as number | undefined;
		const customCss = state.customCss as string | undefined;
		const hideHeader = state.hideHeader as boolean | undefined;

		if (url) {
			await this.loadUrl(url, title, {
				zoom,
				customCss,
				hideHeader,
			});
		} else if (!filePath) {
			await super.setState(state, result);
		}
	}

	clear(): void {
		this.currentUrl = undefined;
		this.currentTitle = undefined;
		this.currentSourcePath = undefined;
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

	private async syncCurrentFile(): Promise<void> {
		if (!this.currentSourcePath) {
			new Notice(this.t("view.noLinkedFile"));
			return;
		}
		if (!this.options.syncSourceFile) {
			new Notice(this.t("view.syncUnavailable"));
			return;
		}

		try {
			const result = await this.options.syncSourceFile(this.currentSourcePath);
			if (!result) {
				new Notice(this.t("view.linkedFileNotFound"));
				return;
			}

			this.currentSourcePath = result.file.path;
			await this.loadFile(result.file);
			new Notice(result.changed
				? this.t("notice.syncedFeishuTitle", {name: result.file.name})
				: this.t("view.titleAlreadyUpToDate"));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(this.t("view.syncFailed", {message: msg}));
			console.error("[obsidian-lark] view sync error:", err);
		}
	}

	private renderEmptyState(): void {
		this.contentEl.empty();
		this.webviewEl = undefined;
		const container = this.contentEl.createDiv({cls: "feishu-doc-empty"});
		container.createEl("p", {
			text: this.t("view.emptyState"),
		});
	}

	private renderWebview(options?: FrameOptions): void {
		if (!this.currentUrl) {
			this.renderEmptyState();
			return;
		}
		this.contentEl.empty();

		const zoomContainer = this.contentEl.createDiv({cls: "feishu-doc-zoom-container"});

		// Use webview on desktop, iframe as fallback
		const useWebview = this.isWebviewAvailable();
		let el: HTMLElement;

		if (useWebview) {
			el = document.createElement("webview");
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
		const container = this.contentEl.querySelector<HTMLElement>(".feishu-doc-zoom-container");
		if (container) {
			container.style.transform = `scale(${this.zoomLevel})`;
			container.style.width = `${100 / this.zoomLevel}%`;
			container.style.height = `${100 / this.zoomLevel}%`;
		}
	}

	private isWebviewAvailable(): boolean {
		// @ts-expect-error webview is available in Electron desktop
		return typeof document?.createElement("webview")?.src !== "undefined";
	}

	private t(key: TranslationKey, vars?: TranslationVars): string {
		return this.options.translate?.(key, vars) ?? translate("en", key, vars);
	}
}

export interface FrameOptions {
	zoom?: number;
	customCss?: string;
	hideHeader?: boolean;
}

export interface FeishuDocViewOptions {
	syncSourceFile?: (sourcePath: string) => Promise<FeishuDocViewSyncResult | null>;
	translate?: Translator;
}

export interface FeishuDocViewSyncResult {
	file: TFile;
	changed: boolean;
}

export async function openFeishuView(
	app: App,
	entry: IndexEntry,
	options?: FrameOptions
): Promise<void> {
	const state = {
		file: entry.path,
		url: entry.feishu_url,
		title: entry.feishu_title,
		sourcePath: entry.path,
		zoom: options?.zoom,
		customCss: options?.customCss,
		hideHeader: options?.hideHeader,
	};

	// 1. Active leaf is a markdown view (most common: user clicked a file)
	// Check view state type first — available before view instance is ready
	const activeLeaf = app.workspace.getMostRecentLeaf();
	if (activeLeaf && activeLeaf.getViewState().type === "markdown") {
		await activeLeaf.setViewState({type: FEISHU_VIEW_TYPE, state});
		return;
	}

	// 2. Already in FeishuDocView (switching between Feishu docs)
	const activeFeishu = app.workspace.getActiveViewOfType(FeishuDocView);
	if (activeFeishu?.leaf) {
		await activeFeishu.leaf.setViewState({type: FEISHU_VIEW_TYPE, state});
		return;
	}

	// 3. Fallback: search all markdown leaves for matching file
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view as MarkdownView;
		if (view.file?.path === entry.path) {
			await leaf.setViewState({type: FEISHU_VIEW_TYPE, state});
			return;
		}
	}

	// 4. Reuse existing FeishuDocView leaf elsewhere
	const leaves = app.workspace.getLeavesOfType(FEISHU_VIEW_TYPE);
	if (leaves.length > 0) {
		const leaf = leaves[0]!;
		await leaf.setViewState({type: FEISHU_VIEW_TYPE, state});
		await app.workspace.revealLeaf(leaf);
		return;
	}

	// 5. Fallback: right sidebar
	const leaf = app.workspace.getRightLeaf(false);
	if (!leaf) return;
	await leaf.setViewState({type: FEISHU_VIEW_TYPE, active: true, state});
	await app.workspace.revealLeaf(leaf);
}
