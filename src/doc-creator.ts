import {App, Modal, Notice, Setting, TFile, normalizePath} from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import {createFeishuDocument} from "./lark-cli";

export class CreateFeishuDocModal extends Modal {
	private plugin: ObsidianFeishuPlugin;
	private titleInput: HTMLInputElement | undefined;
	private contentInput: HTMLTextAreaElement | undefined;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.createEl("h2", {text: "Create Feishu Document"});

		const titleWrap = contentEl.createDiv();
		titleWrap.createEl("label", {text: "Document title"});
		this.titleInput = titleWrap.createEl("input", {type: "text"});
		this.titleInput.style.width = "100%";
		this.titleInput.placeholder = "My Document";

		const contentWrap = contentEl.createDiv();
		contentWrap.createEl("label", {text: "Initial content (optional)"});
		this.contentInput = contentWrap.createEl("textarea");
		this.contentInput.style.width = "100%";
		this.contentInput.style.minHeight = "80px";
		this.contentInput.placeholder = "Optional content...";

		const btnContainer = contentEl.createDiv({cls: "modal-button-container"});

		const createBtn = btnContainer.createEl("button", {cls: "mod-cta", text: "Create"});
		createBtn.addEventListener("click", () => {
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
		const title = this.titleInput?.value.trim() ?? "";
		const content = this.contentInput?.value.trim() ?? "";

		if (!title) {
			new Notice("Please enter a document title.");
			return;
		}

		try {
			const docInfo = await createFeishuDocument(
				this.plugin.settings.larkCliPath,
				title,
				content || undefined
			);

			const note = await this.createObsidianNote(docInfo.title, docInfo.docId, docInfo.url);
			if (note) {
				await this.app.workspace.getLeaf().openFile(note);
				if (this.plugin.settings.autoOpenFeishuView) {
					await this.plugin.openFeishuForFile(note);
				}
			}

			new Notice(`Created Feishu document: ${docInfo.title}`);
			this.close();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to create Feishu document: ${msg}`);
			console.error("[obsidian-feishu] create doc error:", err);
		}
	}

	private async createObsidianNote(
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
			"> **Shadow File** — This note is a local proxy for a Feishu (Lark) document.",
			">",
			"> **Remote source:** Use `lark-cli` to fetch the live content of this document.",
			">",
			"> ```bash",
			`> lark-cli docs +fetch --api-version v2 --doc ${docId}`,
			"> ```",
			">",
			"> This file contains only front matter metadata. The full content resides in Feishu and can be retrieved on-demand via the Lark CLI or associated Lark skills.",
			"",
		].join("\n");

		const content = body
			? `${frontMatter}${shadowNotice}${body}`
			: `${frontMatter}${shadowNotice}`;
		const filePath = normalizePath(`${folderPath}/${this.sanitizeFilename(title)}.md`);
		const finalPath = await this.resolveCollision(filePath);

		return await this.app.vault.create(finalPath, content);
	}

	private sanitizeFilename(name: string): string {
		return name.replace(/[\\/:*?"\u003c\u003e|]/g, " ").trim();
	}

	private async resolveCollision(path: string): Promise<string> {
		let candidate = path;
		let counter = 1;
		const base = candidate.replace(/\.md$/, "");

		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = `${base} (${counter}).md`;
			counter++;
		}

		return candidate;
	}
}
