import {App, Modal, Notice} from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import {createFeishuDocument} from "./lark-cli";
import {createLarkMarkdownNote} from "./lark-note";

export class CreateFeishuDocModal extends Modal {
	private plugin: ObsidianFeishuPlugin;
	private titleInput: HTMLInputElement | undefined;
	private createBtn: HTMLButtonElement | undefined;
	private isLoading = false;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: this.plugin.t("modal.create.title")});

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", {text: this.plugin.t("modal.documentTitle.label")});
		this.titleInput = titleWrap.createEl("input", {
			cls: "feishu-modal-input",
			type: "text",
		});
		this.titleInput.placeholder = this.plugin.t("modal.documentTitle.placeholder");

		const btnContainer = contentEl.createDiv({cls: "modal-button-container"});

		this.createBtn = btnContainer.createEl("button", {cls: "mod-cta", text: this.plugin.t("button.create")});
		this.createBtn.addEventListener("click", () => {
			void this.create();
		});

		const cancelBtn = btnContainer.createEl("button", {text: this.plugin.t("button.cancel")});
		cancelBtn.addEventListener("click", () => {
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async create(): Promise<void> {
		if (this.isLoading) return;

		const title = this.titleInput?.value.trim() ?? "";

		if (!title) {
			new Notice(this.plugin.t("notice.enterDocumentTitle"));
			return;
		}

		this.setLoading(true);

		try {
			const docInfo = await createFeishuDocument(
				this.plugin.settings.larkCliPath,
				title,
				this.plugin.settings.feishuTenantDomain
			);

			const note = await createLarkMarkdownNote(this.app, {
				folderPath: this.plugin.settings.defaultNoteFolder,
				templatePath: this.plugin.settings.noteTemplate,
				title: docInfo.title,
				docId: docInfo.docId,
				url: docInfo.url,
				translate: (key, vars) => this.plugin.t(key, vars),
				onTemplateMissing: (path) => new Notice(this.plugin.t("notice.templateNotFound", {path})),
			});
			if (note) {
				// .lark.md files stay in Obsidian's Markdown open flow, then switch to FeishuDocView.
				await this.app.workspace.getLeaf().openFile(note);
			}

			new Notice(this.plugin.t("notice.createdDocument", {title: docInfo.title}));
			this.close();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(this.plugin.t("notice.createDocumentFailed", {message: msg}));
			console.error("[obsidian-lark] create doc error:", err);
		} finally {
			this.setLoading(false);
		}
	}

	private setLoading(loading: boolean): void {
		this.isLoading = loading;
		if (this.createBtn) {
			this.createBtn.disabled = loading;
			this.createBtn.textContent = loading ? this.plugin.t("button.creating") : this.plugin.t("button.create");
		}
		if (this.titleInput) {
			this.titleInput.disabled = loading;
		}
	}
}
