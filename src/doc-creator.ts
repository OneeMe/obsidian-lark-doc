import {App, Modal, Notice} from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import {createFeishuBase, createFeishuDocument, formatLarkCliError} from "./lark-cli";
import {createLarkMarkdownNote} from "./lark-note";
import type {FeishuDocInfo} from "./types";

type CreateResourceType = "doc" | "base";

export class CreateFeishuDocModal extends Modal {
	private plugin: ObsidianFeishuPlugin;
	private titleInput: HTMLInputElement | undefined;
	private resourceTypeInputs: HTMLInputElement[] = [];
	private resourceType: CreateResourceType = "doc";
	private createBtn: HTMLButtonElement | undefined;
	private isLoading = false;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		this.resourceType = "doc";
		this.resourceTypeInputs = [];
		contentEl.createEl("h2", {text: this.plugin.t("modal.create.title")});

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", {text: this.plugin.t("modal.documentTitle.label")});
		this.titleInput = titleWrap.createEl("input", {
			cls: "feishu-modal-input",
			type: "text",
		});
		this.titleInput.placeholder = this.plugin.t("modal.documentTitle.placeholder");

		const resourceWrap = contentEl.createDiv();
		resourceWrap.createEl("label", {text: this.plugin.t("modal.resourceType.label")});
		const resourceOptions = resourceWrap.createDiv({cls: "feishu-modal-radio-group"});
		this.createResourceTypeOption(resourceOptions, "doc", this.plugin.t("modal.resourceType.doc"), true);
		this.createResourceTypeOption(resourceOptions, "base", this.plugin.t("modal.resourceType.base"), false);

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
		this.resourceTypeInputs = [];
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
			const docInfo = await this.createRemoteResource(
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

			new Notice(this.plugin.t("notice.createdResource", {
				type: this.getResourceTypeLabel(),
				title: docInfo.title,
			}));
			this.close();
		} catch (err) {
			const msg = formatLarkCliError(err, (key, vars) => this.plugin.t(key, vars));
			new Notice(this.plugin.t("notice.createResourceFailed", {message: msg}));
			console.error("[obsidian-lark-doc] create resource error:", err);
		} finally {
			this.setLoading(false);
		}
	}

	private createResourceTypeOption(
		container: HTMLElement,
		value: CreateResourceType,
		label: string,
		checked: boolean
	): void {
		const optionLabel = container.createEl("label", {cls: "feishu-modal-radio-option"});
		const radio = optionLabel.createEl("input", {type: "radio"});
		radio.name = "lark-doc-create-resource-type";
		radio.value = value;
		radio.checked = checked;
		radio.addEventListener("change", () => {
			if (radio.checked) {
				this.resourceType = value;
			}
		});
		optionLabel.createEl("span", {text: label});
		this.resourceTypeInputs.push(radio);
	}

	private async createRemoteResource(
		cliPath: string,
		title: string,
		tenantDomain: string
	): Promise<FeishuDocInfo> {
		if (this.resourceType === "base") {
			return await createFeishuBase(cliPath, title, tenantDomain);
		}
		return await createFeishuDocument(cliPath, title, tenantDomain);
	}

	private getResourceTypeLabel(): string {
		return this.resourceType === "base"
			? this.plugin.t("modal.resourceType.base")
			: this.plugin.t("modal.resourceType.doc");
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
		for (const input of this.resourceTypeInputs) {
			input.disabled = loading;
		}
	}
}
