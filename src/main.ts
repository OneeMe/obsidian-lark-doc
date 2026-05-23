import {
	App,
	Modal,
	Notice,
	Plugin,
	TFile,
	ViewState,
	WorkspaceLeaf,
} from "obsidian";
import {
	FeishuDocView,
	FEISHU_VIEW_TYPE,
	findFeishuLeafForSourcePath,
	openFeishuView,
} from "./feishu-view";
import {FeishuIndexer} from "./indexer";
import {
	DEFAULT_SETTINGS,
	FeishuSettingTab,
	type ObsidianFeishuSettings,
} from "./settings";
import {parseFeishuUrl} from "./types";
import {CreateFeishuDocModal} from "./doc-creator";
import {syncTitle} from "./title-sync";
import {fetchFeishuDocumentTitle, formatLarkCliError} from "./lark-cli";
import {ensureBaseFile, getBaseFilePath} from "./base-manager";
import {readFeishuFrontMatter} from "./feishu-frontmatter";
import {getLarkMarkdownPathFromViewState, isLarkMarkdownFile} from "./lark-file";
import {createLarkMarkdownNote} from "./lark-note";
import {translate, type TranslationKey, type TranslationVars} from "./i18n";

function debugLog(message: string, ...data: unknown[]): void {
	console.debug("[obsidian-lark-doc][debug]", message, ...data);
}

function describeLeaf(leaf: WorkspaceLeaf): Record<string, unknown> {
	try {
		const viewState = leaf.getViewState();
		return {
			type: viewState.type,
			file: viewState.state?.file,
			sourcePath: viewState.state?.sourcePath,
			hasUrl: typeof viewState.state?.url === "string",
		};
	} catch (err) {
		return {
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export default class ObsidianFeishuPlugin extends Plugin {
	settings!: ObsidianFeishuSettings;
	indexer!: FeishuIndexer;
	private suppressedFileOpenPath: string | undefined;

	async onload() {
		await this.loadSettings();
		debugLog("plugin onload", {
			defaultNoteFolder: this.settings.defaultNoteFolder,
			autoOpenFeishuView: this.settings.autoOpenFeishuView,
			syncTitle: this.settings.syncTitle,
			viewType: FEISHU_VIEW_TYPE,
		});

		this.indexer = new FeishuIndexer(this.app);

		// Register custom view
		this.registerView(
			FEISHU_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new FeishuDocView(leaf, {
				syncSourceFile: (sourcePath) => this.syncSourceFile(sourcePath),
				translate: (key, vars) => this.t(key, vars),
			})
		);
		this.registerLarkMarkdownRouting();
		debugLog("registered Lark markdown routing");

		// Ribbon icons
		this.addRibbonIcon("link", this.t("command.addLinkedFeishuDocument"), () => {
			new AddLinkedFeishuDocumentModal(this.app, this).open();
		});

		this.addRibbonIcon("file-plus", this.t("command.createFeishuDocument"), () => {
			new CreateFeishuDocModal(this.app, this).open();
		});

		this.addRibbonIcon("database", this.t("command.openFeishuDocumentsBase"), () => {
			void this.openBaseFile();
		});

		// Commands
		this.addCommand({
			id: "add-linked-feishu-document",
			name: this.t("command.addLinkedFeishuDocument"),
			callback: () => {
				new AddLinkedFeishuDocumentModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "create-feishu-document",
			name: this.t("command.createFeishuDocument"),
			callback: () => {
				new CreateFeishuDocModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "open-feishu-base",
			name: this.t("command.openFeishuDocumentsBase"),
			callback: () => {
				void this.openBaseFile();
			},
		});

		this.addCommand({
			id: "add-feishu-association",
			name: this.t("command.addFeishuAssociation"),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.openAssociationModal(file);
				return true;
			},
		});

		this.addCommand({
			id: "remove-feishu-association",
			name: this.t("command.removeFeishuAssociation"),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (!checking) void this.removeAssociation(file);
				return true;
			},
		});

		this.addCommand({
			id: "sync-feishu-title",
			name: this.t("command.syncFeishuTitleNow"),
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (!this.isFeishuMetadataFile(file)) return false;
				if (!checking) void this.syncTitleForFile(file);
				return true;
			},
		});

		// Settings tab
		this.addSettingTab(new FeishuSettingTab(this.app, this));

		// Auto-open Lark view + title sync on file open
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				debugLog("workspace file-open event", {
					path: file?.path,
					extension: file?.extension,
				});
				if (file && this.suppressedFileOpenPath === file.path) {
					debugLog("workspace file-open event consumed after Lark route notification", {
						path: file.path,
					});
					this.suppressedFileOpenPath = undefined;
					return;
				}
				// Defer to next frame so Obsidian finishes initializing the MarkdownView
				requestAnimationFrame(() => {
					void this.onFileOpen(file);
				});
			})
		);

		// Background sync interval
		this.registerBackgroundSync();

		// Ensure Base file exists
		await this.ensureBaseFile();
	}

	async loadSettings() {
		const savedSettings = await this.loadData() as Partial<ObsidianFeishuSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, savedSettings ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	t(key: TranslationKey, vars?: TranslationVars): string {
		return translate(this.settings?.language ?? DEFAULT_SETTINGS.language, key, vars);
	}

	// --- Frame refresh ---

	refreshFeishuViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(FEISHU_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view as FeishuDocView;
			view.setZoom(this.settings.frameZoom);
			void view.injectCss(this.settings.frameCustomCss, this.settings.hideFeishuHeader);
		}
	}

	// --- Markdown Shadow File Routing ---

	private registerLarkMarkdownRouting(): void {
		const workspaceLeafPrototype = WorkspaceLeaf?.prototype;
		const originalSetViewState = workspaceLeafPrototype
			? getSetViewStateMethod(workspaceLeafPrototype)
			: undefined;
		if (typeof originalSetViewState !== "function") {
			console.warn("[obsidian-lark-doc] WorkspaceLeaf.setViewState is unavailable; falling back to file-open routing.");
			return;
		}
		debugLog("WorkspaceLeaf.setViewState patch installed");

		const routeLarkMarkdownViewState = (leaf: WorkspaceLeaf, viewState: ViewState) =>
			this.routeLarkMarkdownViewState(leaf, viewState);
		const notifyLarkFileOpen = (filePath: string) => this.notifyLarkFileOpen(filePath);

		const patchedSetViewState: WorkspaceLeaf["setViewState"] = async function (
			this: WorkspaceLeaf,
			viewState: ViewState,
			eState?: unknown
		): Promise<void> {
			const larkFilePath = getLarkMarkdownPathFromViewState(viewState);
			if (larkFilePath) {
				debugLog("setViewState intercepted Lark markdown", {
					file: larkFilePath,
					incomingType: viewState.type,
					leaf: describeLeaf(this),
				});
			}
			const routedState = await routeLarkMarkdownViewState(this, viewState);
			if (!routedState) {
				debugLog("setViewState consumed by existing Lark view", {file: larkFilePath});
				return;
			}
			if (larkFilePath) {
				debugLog("setViewState forwarding routed state", {
					file: larkFilePath,
					routedType: routedState.type,
					hasUrl: typeof routedState.state?.url === "string",
					url: routedState.state?.url,
				});
			}
			await originalSetViewState.call(this, routedState, eState);
			if (larkFilePath && routedState.type === FEISHU_VIEW_TYPE) {
				notifyLarkFileOpen(larkFilePath);
			}
		};

		workspaceLeafPrototype.setViewState = patchedSetViewState;
		this.register(() => {
			if (workspaceLeafPrototype.setViewState === patchedSetViewState) {
				workspaceLeafPrototype.setViewState = originalSetViewState;
			}
		});
	}

	private async routeLarkMarkdownViewState(
		leaf: WorkspaceLeaf,
		viewState: ViewState
	): Promise<ViewState | null> {
		const filePath = getLarkMarkdownPathFromViewState(viewState);
		if (!filePath) return viewState;

		debugLog("routeLarkMarkdownViewState matched file", {
			filePath,
			leaf: describeLeaf(leaf),
		});
		const entry = await this.indexer.getEntryByPath(filePath);
		if (!entry) {
			console.warn("[obsidian-lark-doc][debug] routeLarkMarkdownViewState found no index entry", {
				filePath,
			});
			return viewState;
		}

		const feishuLeaves = this.app.workspace.getLeavesOfType(FEISHU_VIEW_TYPE);
		const existingLeaf = findFeishuLeafForSourcePath(feishuLeaves, entry.path);
		debugLog("routeLarkMarkdownViewState resolved entry", {
			filePath,
			entryPath: entry.path,
			url: entry.lark_url,
			feishuLeafCount: feishuLeaves.length,
			existingLeaf: existingLeaf ? describeLeaf(existingLeaf) : null,
		});
		if (existingLeaf && existingLeaf !== leaf) {
			const routedState = this.createLarkMarkdownViewState(viewState, entry);
			debugLog("routeLarkMarkdownViewState refreshing existing leaf", {
				filePath,
				existingLeaf: describeLeaf(existingLeaf),
				currentLeaf: describeLeaf(leaf),
			});
			await existingLeaf.setViewState(routedState);
			await existingLeaf.loadIfDeferred?.();
			await this.app.workspace.revealLeaf(existingLeaf);
			this.notifyLarkFileOpen(entry.path);
			if (leaf.getViewState().type === "empty") {
				debugLog("routeLarkMarkdownViewState detaching empty click target", {
					filePath,
				});
				leaf.detach();
			}
			return null;
		}

		debugLog("routeLarkMarkdownViewState returning new Feishu view state", {
			filePath,
			url: entry.lark_url,
		});
		return this.createLarkMarkdownViewState(viewState, entry);
	}

	private notifyLarkFileOpen(filePath: string): void {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			debugLog("notifyLarkFileOpen skipped missing TFile", {
				filePath,
				file,
			});
			return;
		}

		debugLog("notifyLarkFileOpen triggering workspace file-open", {
			path: file.path,
		});
		this.suppressedFileOpenPath = file.path;
		this.app.workspace.trigger("file-open", file);
		if (this.suppressedFileOpenPath === file.path) {
			this.suppressedFileOpenPath = undefined;
		}
	}

	private createLarkMarkdownViewState(
		viewState: ViewState,
		entry: {
			path: string;
			lark_url: string;
			lark_title?: string;
		}
	): ViewState {
		return {
			...viewState,
			type: FEISHU_VIEW_TYPE,
			state: {
				file: entry.path,
				url: entry.lark_url,
				title: entry.lark_title,
				sourcePath: entry.path,
				zoom: this.settings.frameZoom,
				customCss: this.settings.frameCustomCss,
				hideHeader: this.settings.hideFeishuHeader,
			},
		};
	}

	// --- File Open Handler ---

	private async onFileOpen(file: TFile | null): Promise<void> {
		if (!file) {
			debugLog("onFileOpen skipped null file");
			return;
		}

		if (file.extension !== "md") {
			debugLog("onFileOpen skipped non-markdown", {
				path: file.path,
				extension: file.extension,
			});
			return;
		}

		const entry = await this.indexer.getEntryByPath(file.path);
		if (!entry) {
			if (isLarkMarkdownFile(file)) {
				console.warn("[obsidian-lark-doc][debug] onFileOpen found no index entry for Lark markdown", {
					path: file.path,
				});
			}
			return;
		}
		debugLog("onFileOpen resolved entry", {
			path: file.path,
			isLarkMarkdown: isLarkMarkdownFile(file),
			url: entry.lark_url,
			autoOpenFeishuView: this.settings.autoOpenFeishuView,
		});

		if (isLarkMarkdownFile(file) || this.settings.autoOpenFeishuView) {
			debugLog("onFileOpen opening Feishu view", {
				path: file.path,
				url: entry.lark_url,
			});
			await openFeishuView(this.app, entry, {
				zoom: this.settings.frameZoom,
				customCss: this.settings.frameCustomCss,
				hideHeader: this.settings.hideFeishuHeader,
			});
		} else {
			debugLog("onFileOpen skipped auto-open by settings", {path: file.path});
		}

		if (this.settings.syncTitle) {
			// Fire-and-forget: do not block the view switch
			void this.syncTitleForFile(file);
		}
	}

	// --- Title Sync ---

	private async syncTitleForFile(file: TFile): Promise<void> {
		try {
			const changed = await this.syncFile(file, this.settings.syncTitleToFilename);
			if (changed) {
				new Notice(this.t("notice.syncedFeishuTitle", {name: file.name}));
			}
		} catch (err) {
			console.error("[obsidian-lark-doc] sync title error:", err);
		}
	}

	private async syncSourceFile(sourcePath: string): Promise<{file: TFile; changed: boolean} | null> {
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return null;

		const changed = await this.syncFile(file, true);
		return {file, changed};
	}

	private async syncFile(file: TFile, syncToFilename: boolean): Promise<boolean> {
		return await syncTitle(this.app, file, {
			cliPath: this.settings.larkCliPath,
			syncToFilename,
		});
	}

	// --- Background Sync ---

	private async ensureBaseFile(): Promise<void> {
		try {
			await ensureBaseFile(this.app, this.settings.defaultNoteFolder, (key, vars) => this.t(key, vars));
		} catch (err) {
			console.error("[obsidian-lark-doc] ensure base file error:", err);
			const message = err instanceof Error ? err.message : String(err);
			new Notice(this.t("notice.baseCreateFailed", {message}));
		}
	}

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
		const mdFiles = this.app.vault.getMarkdownFiles();

		for (const file of mdFiles) {
			const frontmatter = await readFeishuFrontMatter(this.app, file);
			if (frontmatter?.lark_doc_id) {
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

	private isFeishuMetadataFile(file: TFile | null): file is TFile {
		return !!file && file.extension === "md";
	}

	// --- Open Base File ---

	private async openBaseFile(): Promise<void> {
		const basePath = getBaseFilePath(this.settings.defaultNoteFolder);
		const file = this.app.vault.getAbstractFileByPath(basePath);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf().openFile(file);
		} else {
			new Notice(this.t("notice.baseFileNotFound", {path: basePath}));
		}
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
			new Notice(this.t("notice.noFrontMatterFound"));
			return;
		}

		const keptLines: string[] = [];
		for (let i = fmStart + 1; i < fmEnd; i++) {
			const line = lines[i]!;
			const key = line.split(":")[0]?.trim();
			if (key !== "lark_doc_id" && key !== "lark_url" && key !== "lark_title") {
				keptLines.push(line);
			}
		}

		const bodyLines = lines.slice(fmEnd + 1);
		const newContent = keptLines.length > 0
			? ["---", ...keptLines, "---", ...bodyLines].join("\n")
			: bodyLines.join("\n");

		await this.app.vault.modify(file, newContent);
		new Notice(this.t("notice.removedAssociation", {name: file.name}));
	}
}

function getSetViewStateMethod(prototype: object): WorkspaceLeaf["setViewState"] | undefined {
	let current: object | null = prototype;
	while (current) {
		const descriptor = Object.getOwnPropertyDescriptor(current, "setViewState");
		if (typeof descriptor?.value === "function") {
			return descriptor.value as WorkspaceLeaf["setViewState"];
		}
		current = Object.getPrototypeOf(current) as object | null;
	}
	return undefined;
}

export class AddLinkedFeishuDocumentModal extends Modal {
	private plugin: ObsidianFeishuPlugin;
	private urlInput: HTMLInputElement | undefined;
	private addBtn: HTMLButtonElement | undefined;
	private isLoading = false;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: this.plugin.t("modal.addLinked.title")});

		const urlWrap = contentEl.createDiv();
		urlWrap.createEl("label", {text: this.plugin.t("modal.feishuUrl.label")});
		this.urlInput = urlWrap.createEl("input", {
			cls: "feishu-modal-input",
			type: "text",
		});
		this.urlInput.placeholder = "https://www.feishu.cn/wiki/...";

		const btnContainer = contentEl.createDiv({cls: "modal-button-container"});
		this.addBtn = btnContainer.createEl("button", {cls: "mod-cta", text: this.plugin.t("button.add")});
		this.addBtn.addEventListener("click", () => {
			void this.add();
		});
		const cancelBtn = btnContainer.createEl("button", {text: this.plugin.t("button.cancel")});
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async add(): Promise<void> {
		if (this.isLoading) return;

		const url = this.urlInput?.value.trim() ?? "";

		if (!url) {
			new Notice(this.plugin.t("notice.enterFeishuUrl"));
			return;
		}

		const parsed = parseFeishuUrl(url);
		if (!parsed) {
			new Notice(this.plugin.t("notice.invalidFeishuUrl"));
			return;
		}

		this.setLoading(true);
		try {
			const noteTitle = (await fetchFeishuDocumentTitle(
				this.plugin.settings.larkCliPath,
				parsed.docId
			)).trim();
			if (!noteTitle) {
				throw new Error(this.plugin.t("notice.fetchTitleFailed"));
			}
			const note = await createLarkMarkdownNote(this.app, {
				folderPath: this.plugin.settings.defaultNoteFolder,
				templatePath: this.plugin.settings.noteTemplate,
				title: noteTitle,
				docId: parsed.docId,
				url: parsed.url,
				translate: (key, vars) => this.plugin.t(key, vars),
				onTemplateMissing: (path) => new Notice(this.plugin.t("notice.templateNotFound", {path})),
			});
			await this.app.workspace.getLeaf().openFile(note);
			new Notice(this.plugin.t("notice.addedLinkedDocument", {title: noteTitle}));
			this.close();
		} catch (err) {
			const msg = formatLarkCliError(err, (key, vars) => this.plugin.t(key, vars));
			new Notice(this.plugin.t("notice.addLinkedDocumentFailed", {message: msg}));
			console.error("[obsidian-lark-doc] add linked doc error:", err);
		} finally {
			this.setLoading(false);
		}
	}

	private setLoading(loading: boolean): void {
		this.isLoading = loading;
		if (this.addBtn) {
			this.addBtn.disabled = loading;
			this.addBtn.textContent = loading ? this.plugin.t("button.adding") : this.plugin.t("button.add");
		}
		if (this.urlInput) {
			this.urlInput.disabled = loading;
		}
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
		contentEl.createEl("h2", {text: this.plugin.t("modal.addAssociation.title")});

		const urlWrap = contentEl.createDiv();
		urlWrap.createEl("label", {text: this.plugin.t("modal.feishuUrl.label")});
		this.urlInput = urlWrap.createEl("input", {
			cls: "feishu-modal-input",
			type: "text",
		});
		this.urlInput.placeholder = "https://www.feishu.cn/docs/...";

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", {text: this.plugin.t("modal.documentTitleOptional.label")});
		this.titleInput = titleWrap.createEl("input", {
			cls: "feishu-modal-input",
			type: "text",
		});
		this.titleInput.placeholder = this.plugin.t("modal.documentTitleOptional.placeholder");

		const btnContainer = contentEl.createDiv({cls: "modal-button-container"});
		const saveBtn = btnContainer.createEl("button", {cls: "mod-cta", text: this.plugin.t("button.save")});
		saveBtn.addEventListener("click", () => {
			void this.save();
		});
		const cancelBtn = btnContainer.createEl("button", {text: this.plugin.t("button.cancel")});
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async save(): Promise<void> {
		const url = this.urlInput?.value.trim() ?? "";
		const title = this.titleInput?.value.trim() ?? "";

		if (!url) {
			new Notice(this.plugin.t("notice.enterFeishuUrl"));
			return;
		}

		const parsed = parseFeishuUrl(url);
		if (!parsed) {
			new Notice(this.plugin.t("notice.invalidFeishuUrl"));
			return;
		}

		await this.updateFrontMatter(parsed.docId, parsed.url, title || undefined);
		new Notice(this.plugin.t("notice.associationSaved", {name: this.file.name}));
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

		fmMap.set("lark_doc_id", docId);
		fmMap.set("lark_url", url);
		if (title) fmMap.set("lark_title", title);

		const newFm = Array.from(fmMap.entries()).map(([k, v]) => `${k}: ${v}`);
		const newContent = fmStart !== -1
			? ["---", ...newFm, "---", ...bodyLines].join("\n")
			: ["---", ...newFm, "---", "", ...bodyLines].join("\n");

		await this.app.vault.modify(this.file, newContent);
	}
}
