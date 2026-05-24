export const LANGUAGE_OPTIONS = [
	{value: "auto", labelKey: "language.auto"},
	{value: "en", labelKey: "language.english"},
	{value: "zh-CN", labelKey: "language.chineseSimplified"},
] as const;

export type PluginLanguage = typeof LANGUAGE_OPTIONS[number]["value"];
type ResolvedLanguage = Exclude<PluginLanguage, "auto">;
export type TranslationVars = Record<string, string | number | boolean | undefined | null>;

const EN_TRANSLATIONS = {
	"language.auto": "Auto",
	"language.english": "English",
	"language.chineseSimplified": "Simplified Chinese",

	"command.addLinkedFeishuDocument": "Add linked Lark document",
	"command.createFeishuDocument": "Create Lark document",
	"command.openFeishuDocumentsBase": "Open Lark documents base",
	"command.addFeishuAssociation": "Add Lark association",
	"command.removeFeishuAssociation": "Remove Lark association",
	"command.syncFeishuTitleNow": "Sync Lark title now",

	"settings.interface": "Interface",
	"settings.language.name": "Language",
	"settings.language.desc": "Choose the plugin language. Command names and ribbon tooltips update after Obsidian reloads the plugin.",
	"settings.connection": "Connection",
	"settings.larkCliPath.name": "Lark CLI path",
	"settings.larkCliPath.desc": "Path to the Lark CLI executable. Use an absolute path if Obsidian cannot find lark-cli.",
	"settings.larkCliPath.placeholder": "Lark CLI",
	"settings.defaultNoteFolder.name": "Default note folder",
	"settings.defaultNoteFolder.desc": "Vault folder where new Lark-linked notes are created.",
	"settings.autoOpenFeishuView.name": "Auto-open Lark view",
	"settings.autoOpenFeishuView.desc": "Automatically open the Lark document preview when you open a linked note.",
	"settings.syncTitle.name": "Sync title from Lark",
	"settings.syncTitle.desc": "Fetch the latest title from Lark when opening a linked note.",
	"settings.syncTitleToFilename.name": "Sync title to filename",
	"settings.syncTitleToFilename.desc": "Rename the Obsidian note file when the Lark title changes.",
	"settings.backgroundSyncInterval.name": "Background sync interval (minutes)",
	"settings.backgroundSyncInterval.desc": "How often to enumerate Markdown notes and check linked Lark titles in the background (0 = disabled).",
	"settings.noteTemplate.name": "Note template",
	"settings.noteTemplate.desc": "Optional template file (vault path) for new notes. Front matter is prepended automatically.",
	"settings.noteTemplate.placeholder": "Templates/Lark Note.md",
	"settings.previewFrame": "Preview frame",
	"settings.zoomLevel.name": "Zoom level",
	"settings.zoomLevel.desc": "Scale the Lark document preview (0.5 = half size, 1.5 = 150%).",
	"settings.hideFeishuHeader.name": "Hide Lark header",
	"settings.hideFeishuHeader.desc": "Inject CSS to hide the Lark document top navigation bar for a cleaner view.",
	"settings.customCss.name": "Custom CSS",
	"settings.customCss.desc": "Additional CSS to inject into the Lark preview frame.",
	"settings.customCss.placeholder": ".header { display: none !important; }",

	"modal.addLinked.title": "Add linked Lark document",
	"modal.addAssociation.title": "Add Lark association",
	"modal.create.title": "Create Lark document",
	"modal.feishuUrl.label": "Lark or Feishu document / Base URL",
	"modal.documentTitle.label": "Document title",
	"modal.documentTitleOptional.label": "Document title (optional)",
	"modal.documentTitle.placeholder": "My document",
	"modal.documentTitleOptional.placeholder": "My Lark doc",
	"modal.resourceType.label": "Create as",
	"modal.resourceType.doc": "Document",
	"modal.resourceType.base": "Base",
	"button.add": "Add",
	"button.adding": "Adding...",
	"button.cancel": "Cancel",
	"button.create": "Create",
	"button.creating": "Creating...",
	"button.save": "Save",

	"notice.enterFeishuUrl": "Please enter a Lark or Feishu URL.",
	"notice.invalidFeishuUrl": "Invalid Lark or Feishu URL.",
	"notice.enterDocumentTitle": "Please enter a document title.",
	"notice.fetchTitleFailed": "Could not fetch Lark document or Base title.",
	"notice.templateNotFound": "Template not found: {{path}}",
	"notice.addedLinkedDocument": "Added linked Lark item: {{title}}",
	"notice.addLinkedDocumentFailed": "Failed to add linked Lark item: {{message}}",
	"notice.createdDocument": "Created Lark document: {{title}}",
	"notice.createDocumentFailed": "Failed to create Lark document: {{message}}",
	"notice.createdResource": "Created Lark {{type}}: {{title}}",
	"notice.createResourceFailed": "Failed to create Lark item: {{message}}",
	"notice.syncedFeishuTitle": "Synced Lark title for {{name}}",
	"notice.copiedFeishuLink": "Copied Lark document link.",
	"notice.baseCreateFailed": "Lark Doc loaded, but failed to create the Lark documents base: {{message}}",
	"notice.baseFileNotFound": "Base file not found: {{path}}",
	"notice.noFrontMatterFound": "No front matter found.",
	"notice.removedAssociation": "Removed Lark association from {{name}}",
	"notice.associationSaved": "Lark association saved for {{name}}",

	"error.larkCliNotFound": "Lark CLI was not found. Current value: {{cliPath}}. Obsidian may not inherit your terminal PATH. Set an absolute path to Lark CLI in plugin settings.",

	"view.defaultTitle": "Lark Document",
	"view.displayPrefix": "Lark: {{title}}",
	"view.syncAction": "Sync Lark title and filename",
	"view.copyLinkAction": "Copy Lark link",
	"view.noLinkedFile": "No linked Obsidian file to sync.",
	"view.syncUnavailable": "Sync is not available for this view.",
	"view.copyLinkUnavailable": "No Lark link to copy.",
	"view.copyLinkFailed": "Failed to copy Lark link: {{message}}",
	"view.linkedFileNotFound": "Linked Obsidian file not found.",
	"view.titleAlreadyUpToDate": "Lark title is already up to date.",
	"view.syncFailed": "Failed to sync Lark title: {{message}}",
	"view.emptyState": "Open a note with Lark front matter to view the document here.",

	"shadow.title": "Shadow File",
	"shadow.description": "This note is a local proxy for a Lark or Feishu cloud document or Base.",
	"shadow.wikiUrl": "Lark URL",
	"shadow.nodeInfo": "Resource info (via lark-cli)",
	"shadow.footer": "This file contains only front matter metadata. The full content resides in Lark and can be viewed at the URL above.",

	"base.larkTitle": "Lark Title",
	"base.url": "URL",
	"base.allDocuments": "All Documents",
} as const;

export type TranslationKey = keyof typeof EN_TRANSLATIONS;
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;

const ZH_CN_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
	"language.auto": "自动",
	"language.english": "English",
	"language.chineseSimplified": "简体中文",

	"command.addLinkedFeishuDocument": "添加关联 Lark 文档",
	"command.createFeishuDocument": "新建 Lark 文档",
	"command.openFeishuDocumentsBase": "打开 Lark 文档 Base",
	"command.addFeishuAssociation": "添加 Lark 关联",
	"command.removeFeishuAssociation": "移除 Lark 关联",
	"command.syncFeishuTitleNow": "立即同步 Lark 标题",

	"settings.interface": "界面",
	"settings.language.name": "语言",
	"settings.language.desc": "选择插件语言。命令名称和侧边栏按钮提示会在 Obsidian 重新加载插件后更新。",
	"settings.connection": "连接",
	"settings.larkCliPath.name": "Lark CLI 路径",
	"settings.larkCliPath.desc": "Lark CLI 可执行文件路径。如果 Obsidian 找不到 lark-cli，请填写绝对路径。",
	"settings.larkCliPath.placeholder": "Lark CLI",
	"settings.defaultNoteFolder.name": "默认笔记目录",
	"settings.defaultNoteFolder.desc": "新建 Lark 关联笔记时使用的 vault 目录。",
	"settings.autoOpenFeishuView.name": "自动打开 Lark 视图",
	"settings.autoOpenFeishuView.desc": "打开关联笔记时自动打开 Lark 文档预览。",
	"settings.syncTitle.name": "从 Lark 同步标题",
	"settings.syncTitle.desc": "打开关联笔记时从 Lark 获取最新标题。",
	"settings.syncTitleToFilename.name": "同步标题到文件名",
	"settings.syncTitleToFilename.desc": "Lark 标题变化时重命名 Obsidian 笔记文件。",
	"settings.backgroundSyncInterval.name": "后台同步间隔（分钟）",
	"settings.backgroundSyncInterval.desc": "后台枚举 Markdown 笔记并检查关联 Lark 标题的频率（0 表示关闭）。",
	"settings.noteTemplate.name": "笔记模板",
	"settings.noteTemplate.desc": "新建笔记可使用的模板文件（vault 路径）。Front matter 会自动添加到顶部。",
	"settings.noteTemplate.placeholder": "Templates/Lark Note.md",
	"settings.previewFrame": "预览窗口",
	"settings.zoomLevel.name": "缩放比例",
	"settings.zoomLevel.desc": "缩放 Lark 文档预览（0.5 = 半尺寸，1.5 = 150%）。",
	"settings.hideFeishuHeader.name": "隐藏 Lark 顶部栏",
	"settings.hideFeishuHeader.desc": "注入 CSS 隐藏 Lark 文档顶部导航栏，让预览更简洁。",
	"settings.customCss.name": "自定义 CSS",
	"settings.customCss.desc": "额外注入到 Lark 预览窗口的 CSS。",
	"settings.customCss.placeholder": ".header { display: none !important; }",

	"modal.addLinked.title": "添加关联 Lark 文档",
	"modal.addAssociation.title": "添加 Lark 关联",
	"modal.create.title": "新建 Lark 文档",
	"modal.feishuUrl.label": "Lark/飞书文档或多维表格 URL",
	"modal.documentTitle.label": "文档标题",
	"modal.documentTitleOptional.label": "文档标题（可选）",
	"modal.documentTitle.placeholder": "我的文档",
	"modal.documentTitleOptional.placeholder": "我的 Lark 文档",
	"modal.resourceType.label": "创建类型",
	"modal.resourceType.doc": "文档",
	"modal.resourceType.base": "多维表格",
	"button.add": "添加",
	"button.adding": "添加中...",
	"button.cancel": "取消",
	"button.create": "创建",
	"button.creating": "创建中...",
	"button.save": "保存",

	"notice.enterFeishuUrl": "请输入 Lark 或飞书 URL。",
	"notice.invalidFeishuUrl": "无效的 Lark 或飞书 URL。",
	"notice.enterDocumentTitle": "请输入文档标题。",
	"notice.fetchTitleFailed": "无法获取 Lark 文档或多维表格标题。",
	"notice.templateNotFound": "未找到模板：{{path}}",
	"notice.addedLinkedDocument": "已添加关联 Lark 项目：{{title}}",
	"notice.addLinkedDocumentFailed": "添加关联 Lark 项目失败：{{message}}",
	"notice.createdDocument": "已创建 Lark 文档：{{title}}",
	"notice.createDocumentFailed": "创建 Lark 文档失败：{{message}}",
	"notice.createdResource": "已创建 Lark {{type}}：{{title}}",
	"notice.createResourceFailed": "创建 Lark 项目失败：{{message}}",
	"notice.syncedFeishuTitle": "已同步 Lark 标题：{{name}}",
	"notice.copiedFeishuLink": "已复制 Lark 文档链接。",
	"notice.baseCreateFailed": "Lark Doc 已加载，但创建 Lark 文档 Base 失败：{{message}}",
	"notice.baseFileNotFound": "未找到 Base 文件：{{path}}",
	"notice.noFrontMatterFound": "未找到 Front matter。",
	"notice.removedAssociation": "已从 {{name}} 移除 Lark 关联",
	"notice.associationSaved": "已保存 {{name}} 的 Lark 关联",

	"error.larkCliNotFound": "未找到 Lark CLI。当前配置：{{cliPath}}。Obsidian 可能没有继承终端 PATH。请在插件设置中填写 Lark CLI 的绝对路径。",

	"view.defaultTitle": "Lark 文档",
	"view.displayPrefix": "Lark：{{title}}",
	"view.syncAction": "同步 Lark 标题和文件名",
	"view.copyLinkAction": "复制 Lark 链接",
	"view.noLinkedFile": "没有可同步的关联 Obsidian 文件。",
	"view.syncUnavailable": "当前视图不可同步。",
	"view.copyLinkUnavailable": "没有可复制的 Lark 链接。",
	"view.copyLinkFailed": "复制 Lark 链接失败：{{message}}",
	"view.linkedFileNotFound": "未找到关联的 Obsidian 文件。",
	"view.titleAlreadyUpToDate": "Lark 标题已经是最新。",
	"view.syncFailed": "同步 Lark 标题失败：{{message}}",
	"view.emptyState": "打开包含 Lark Front matter 的笔记后，可在这里查看文档。",

	"shadow.title": "影子文件",
	"shadow.description": "这篇笔记是 Lark/飞书云文档或多维表格的本地代理。",
	"shadow.wikiUrl": "Lark URL",
	"shadow.nodeInfo": "资源信息（通过 lark-cli）",
	"shadow.footer": "这个文件只保存 Front matter 元数据。完整内容仍在 Lark 中，可通过上面的 URL 查看。",

	"base.larkTitle": "Lark 标题",
	"base.url": "URL",
	"base.allDocuments": "全部文档",
};

const TRANSLATIONS: Record<ResolvedLanguage, Record<TranslationKey, string>> = {
	en: EN_TRANSLATIONS,
	"zh-CN": {...EN_TRANSLATIONS, ...ZH_CN_TRANSLATIONS},
};

interface MomentGlobal {
	moment?: {
		locale: () => string;
	};
}

export function translate(
	language: string | undefined,
	key: TranslationKey,
	vars: TranslationVars = {}
): string {
	const resolvedLanguage = resolveLanguage(language, detectRuntimeLocale());
	const template = TRANSLATIONS[resolvedLanguage][key] ?? EN_TRANSLATIONS[key] ?? key;
	return interpolate(template, vars);
}

export function createTranslator(language: string | undefined): Translator {
	return (key, vars) => translate(language, key, vars);
}

export function resolveLanguage(language: string | undefined, locale = "en"): ResolvedLanguage {
	if (language === "zh-CN" || (language === "auto" && isChineseLocale(locale))) {
		return "zh-CN";
	}
	if (language === "en" || language === "auto" || !language) {
		return "en";
	}
	return isChineseLocale(language) ? "zh-CN" : "en";
}

function detectRuntimeLocale(): string {
	const runtime = globalThis as typeof globalThis & MomentGlobal;
	const momentLocale = runtime.moment?.locale?.();
	if (momentLocale) return momentLocale;

	if (typeof document !== "undefined" && document.documentElement.lang) {
		return document.documentElement.lang;
	}

	if (typeof navigator !== "undefined" && navigator.language) {
		return navigator.language;
	}

	return "en";
}

function isChineseLocale(locale: string): boolean {
	const normalized = locale.toLowerCase();
	return normalized === "zh" || normalized.startsWith("zh-");
}

function interpolate(template: string, vars: TranslationVars): string {
	return template.replace(/\{\{(\w+)}}/g, (_, key: string) => {
		const value = vars[key];
		return value === undefined || value === null ? "" : String(value);
	});
}
