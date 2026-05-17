import {App, Modal, Notice, TFile, normalizePath} from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import {createFeishuDocument} from "./lark-cli";
import {LARK_MARKDOWN_SUFFIX} from "./lark-file";

export class CreateFeishuDocModal extends Modal {
	private plugin: ObsidianFeishuPlugin;
	private titleInput: HTMLInputElement | undefined;
	private contentInput: HTMLTextAreaElement | undefined;
	private createBtn: HTMLButtonElement | undefined;
	private isLoading = false;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Create Feishu document"});

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", {text: "Document title"});
		this.titleInput = titleWrap.createEl("input", {
			cls: "feishu-modal-input",
			type: "text",
		});
		this.titleInput.placeholder = "My document";

		const contentWrap = contentEl.createDiv();
		contentWrap.createEl("label", {text: "Initial content (optional)"});
		this.contentInput = contentWrap.createEl("textarea", {
			cls: "feishu-modal-textarea",
		});
		this.contentInput.placeholder = "Optional content...";

		const btnContainer = contentEl.createDiv({cls: "modal-button-container"});

		this.createBtn = btnContainer.createEl("button", {cls: "mod-cta", text: "Create"});
		this.createBtn.addEventListener("click", () => {
			void this.create();
		});

		const cancelBtn = btnContainer.createEl("button", {text: "Cancel"});
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
		const content = this.contentInput?.value.trim() ?? "";

		if (!title) {
			new Notice("Please enter a document title.");
			return;
		}

		this.setLoading(true);

		try {
			const docInfo = await createFeishuDocument(
				this.plugin.settings.larkCliPath,
				title,
				this.plugin.settings.feishuTenantDomain,
				content || undefined
			);

			const note = await this.createLarkNote(docInfo.title, docInfo.docId, docInfo.url);
			if (note) {
				// .lark.md files stay in Obsidian's Markdown open flow, then switch to FeishuDocView.
				await this.app.workspace.getLeaf().openFile(note);
			}

			new Notice(`Created Feishu document: ${docInfo.title}`);
			this.close();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to create Feishu document: ${msg}`);
			console.error("[obsidian-feishu] create doc error:", err);
		} finally {
			this.setLoading(false);
		}
	}

	private setLoading(loading: boolean): void {
		this.isLoading = loading;
		if (this.createBtn) {
			this.createBtn.disabled = loading;
			this.createBtn.textContent = loading ? "Creating..." : "Create";
		}
		if (this.titleInput) {
			this.titleInput.disabled = loading;
		}
		if (this.contentInput) {
			this.contentInput.disabled = loading;
		}
	}

	private async createLarkNote(
		title: string,
		docId: string,
		url: string
	): Promise<TFile | null> {
		const folder = this.plugin.settings.defaultNoteFolder;
		const folderPath = normalizePath(folder);

		const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folderExists) {
			await this.app.vault.createFolder(folderPath);
		}

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

		const shadowNotice = [
			"> **Shadow File** — This note is a local proxy for a Feishu (Lark) wiki document.",
			">",
			`> **Wiki URL:** ${url}`,
			">",
			"> **Node info (via lark-cli):**",
			"> ```bash",
			`> lark-cli wiki spaces get_node --params '{"token":"${docId}"}' --format json`,
			"> ```",
			">",
			"> This file contains only front matter metadata. The full content resides in Feishu and can be viewed at the wiki URL above.",
			"",
		].join("\n");

		const content = body
			? `${frontMatter}${shadowNotice}${body}`
			: `${frontMatter}${shadowNotice}`;
		const filePath = normalizePath(`${folderPath}/${this.sanitizeFilename(title)}${LARK_MARKDOWN_SUFFIX}`);
		const finalPath = await this.resolveCollision(filePath);

		return await this.app.vault.create(finalPath, content);
	}

	private sanitizeFilename(name: string): string {
		return name.replace(/[\\/:*?"\u003c\u003e|]/g, " ").trim();
	}

	private async resolveCollision(path: string): Promise<string> {
		let candidate = path;
		let counter = 1;
		const base = candidate.slice(0, -LARK_MARKDOWN_SUFFIX.length);

		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = `${base} (${counter})${LARK_MARKDOWN_SUFFIX}`;
			counter++;
		}

		return candidate;
	}
}
