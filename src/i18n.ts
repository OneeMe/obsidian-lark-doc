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

	"command.addLinkedFeishuDocument": "Add linked Feishu document",
	"command.createFeishuDocument": "Create Feishu document",
	"command.openFeishuDocumentsBase": "Open Feishu documents base",
	"command.addFeishuAssociation": "Add Feishu association",
	"command.removeFeishuAssociation": "Remove Feishu association",
	"command.syncFeishuTitleNow": "Sync Feishu title now",

	"settings.interface": "Interface",
	"settings.language.name": "Language",
	"settings.language.desc": "Choose the plugin language. Command names and ribbon tooltips update after Obsidian reloads the plugin.",
	"settings.connection": "Connection",
	"settings.larkCliPath.name": "Lark CLI path",
	"settings.larkCliPath.desc": "Path to the Lark CLI executable.",
	"settings.larkCliPath.placeholder": "Lark CLI",
	"settings.defaultNoteFolder.name": "Default note folder",
	"settings.defaultNoteFolder.desc": "Vault folder where new Feishu-linked notes are created.",
	"settings.autoOpenFeishuView.name": "Auto-open Feishu view",
	"settings.autoOpenFeishuView.desc": "Automatically open the Feishu document preview when you open a linked note.",
	"settings.syncTitle.name": "Sync title from Feishu",
	"settings.syncTitle.desc": "Fetch the latest title from Feishu when opening a linked note.",
	"settings.syncTitleToFilename.name": "Sync title to filename",
	"settings.syncTitleToFilename.desc": "Rename the Obsidian note file when the Feishu title changes.",
	"settings.backgroundSyncInterval.name": "Background sync interval (minutes)",
	"settings.backgroundSyncInterval.desc": "How often to check for title changes in the background (0 = disabled).",
	"settings.noteTemplate.name": "Note template",
	"settings.noteTemplate.desc": "Optional template file (vault path) for new notes. Front matter is prepended automatically.",
	"settings.noteTemplate.placeholder": "Templates/Feishu Note.md",
	"settings.previewFrame": "Preview frame",
	"settings.zoomLevel.name": "Zoom level",
	"settings.zoomLevel.desc": "Scale the Feishu document preview (0.5 = half size, 1.5 = 150%).",
	"settings.hideFeishuHeader.name": "Hide Feishu header",
	"settings.hideFeishuHeader.desc": "Inject CSS to hide the Feishu document top navigation bar for a cleaner view.",
	"settings.customCss.name": "Custom CSS",
	"settings.customCss.desc": "Additional CSS to inject into the Feishu preview frame.",
	"settings.customCss.placeholder": ".header { display: none !important; }",

	"modal.addLinked.title": "Add linked Feishu document",
	"modal.addAssociation.title": "Add Feishu association",
	"modal.create.title": "Create Feishu document",
	"modal.feishuUrl.label": "Feishu document URL",
	"modal.documentTitle.label": "Document title",
	"modal.documentTitleOptional.label": "Document title (optional)",
	"modal.documentTitle.placeholder": "My document",
	"modal.documentTitleOptional.placeholder": "My Feishu doc",
	"button.add": "Add",
	"button.adding": "Adding...",
	"button.cancel": "Cancel",
	"button.create": "Create",
	"button.creating": "Creating...",
	"button.save": "Save",

	"notice.enterFeishuUrl": "Please enter a Feishu URL.",
	"notice.invalidFeishuUrl": "Invalid Feishu URL.",
	"notice.enterDocumentTitle": "Please enter a document title.",
	"notice.fetchTitleFailed": "Could not fetch Feishu document title.",
	"notice.templateNotFound": "Template not found: {{path}}",
	"notice.addedLinkedDocument": "Added linked Feishu document: {{title}}",
	"notice.addLinkedDocumentFailed": "Failed to add linked Feishu document: {{message}}",
	"notice.createdDocument": "Created Feishu document: {{title}}",
	"notice.createDocumentFailed": "Failed to create Feishu document: {{message}}",
	"notice.syncedFeishuTitle": "Synced Feishu title for {{name}}",
	"notice.baseCreateFailed": "Obsidian Feishu loaded, but failed to create the Feishu documents base: {{message}}",
	"notice.baseFileNotFound": "Base file not found: {{path}}",
	"notice.noFrontMatterFound": "No front matter found.",
	"notice.removedAssociation": "Removed Feishu association from {{name}}",
	"notice.associationSaved": "Feishu association saved for {{name}}",

	"view.defaultTitle": "Feishu Document",
	"view.displayPrefix": "Feishu: {{title}}",
	"view.syncAction": "Sync Feishu title and filename",
	"view.noLinkedFile": "No linked Obsidian file to sync.",
	"view.syncUnavailable": "Sync is not available for this view.",
	"view.linkedFileNotFound": "Linked Obsidian file not found.",
	"view.titleAlreadyUpToDate": "Feishu title is already up to date.",
	"view.syncFailed": "Failed to sync Feishu title: {{message}}",
	"view.emptyState": "Open a note with Feishu front matter to view the document here.",

	"shadow.title": "Shadow File",
	"shadow.description": "This note is a local proxy for a Feishu (Lark) wiki document.",
	"shadow.wikiUrl": "Wiki URL",
	"shadow.nodeInfo": "Node info (via lark-cli)",
	"shadow.footer": "This file contains only front matter metadata. The full content resides in Feishu and can be viewed at the wiki URL above.",

	"base.feishuTitle": "Feishu Title",
	"base.url": "URL",
	"base.allDocuments": "All Documents",
} as const;

export type TranslationKey = keyof typeof EN_TRANSLATIONS;
export type Translator = (key: TranslationKey, vars?: TranslationVars) => string;

const ZH_CN_TRANSLATIONS: Partial<Record<TranslationKey, string>> = {
	"language.auto": "自动",
	"language.english": "English",
	"language.chineseSimplified": "简体中文",

	"command.addLinkedFeishuDocument": "添加关联飞书文档",
	"command.createFeishuDocument": "新建飞书文档",
	"command.openFeishuDocumentsBase": "打开飞书文档 Base",
	"command.addFeishuAssociation": "添加飞书关联",
	"command.removeFeishuAssociation": "移除飞书关联",
	"command.syncFeishuTitleNow": "立即同步飞书标题",

	"settings.interface": "界面",
	"settings.language.name": "语言",
	"settings.language.desc": "选择插件语言。命令名称和侧边栏按钮提示会在 Obsidian 重新加载插件后更新。",
	"settings.connection": "连接",
	"settings.larkCliPath.name": "Lark CLI 路径",
	"settings.larkCliPath.desc": "Lark CLI 可执行文件路径。",
	"settings.larkCliPath.placeholder": "Lark CLI",
	"settings.defaultNoteFolder.name": "默认笔记目录",
	"settings.defaultNoteFolder.desc": "新建飞书关联笔记时使用的 vault 目录。",
	"settings.autoOpenFeishuView.name": "自动打开飞书视图",
	"settings.autoOpenFeishuView.desc": "打开关联笔记时自动打开飞书文档预览。",
	"settings.syncTitle.name": "从飞书同步标题",
	"settings.syncTitle.desc": "打开关联笔记时从飞书获取最新标题。",
	"settings.syncTitleToFilename.name": "同步标题到文件名",
	"settings.syncTitleToFilename.desc": "飞书标题变化时重命名 Obsidian 笔记文件。",
	"settings.backgroundSyncInterval.name": "后台同步间隔（分钟）",
	"settings.backgroundSyncInterval.desc": "后台检查标题变化的频率（0 表示关闭）。",
	"settings.noteTemplate.name": "笔记模板",
	"settings.noteTemplate.desc": "新建笔记可使用的模板文件（vault 路径）。Front matter 会自动添加到顶部。",
	"settings.noteTemplate.placeholder": "Templates/Feishu Note.md",
	"settings.previewFrame": "预览窗口",
	"settings.zoomLevel.name": "缩放比例",
	"settings.zoomLevel.desc": "缩放飞书文档预览（0.5 = 半尺寸，1.5 = 150%）。",
	"settings.hideFeishuHeader.name": "隐藏飞书顶部栏",
	"settings.hideFeishuHeader.desc": "注入 CSS 隐藏飞书文档顶部导航栏，让预览更简洁。",
	"settings.customCss.name": "自定义 CSS",
	"settings.customCss.desc": "额外注入到飞书预览窗口的 CSS。",
	"settings.customCss.placeholder": ".header { display: none !important; }",

	"modal.addLinked.title": "添加关联飞书文档",
	"modal.addAssociation.title": "添加飞书关联",
	"modal.create.title": "新建飞书文档",
	"modal.feishuUrl.label": "飞书文档 URL",
	"modal.documentTitle.label": "文档标题",
	"modal.documentTitleOptional.label": "文档标题（可选）",
	"modal.documentTitle.placeholder": "我的文档",
	"modal.documentTitleOptional.placeholder": "我的飞书文档",
	"button.add": "添加",
	"button.adding": "添加中...",
	"button.cancel": "取消",
	"button.create": "创建",
	"button.creating": "创建中...",
	"button.save": "保存",

	"notice.enterFeishuUrl": "请输入飞书 URL。",
	"notice.invalidFeishuUrl": "无效的飞书 URL。",
	"notice.enterDocumentTitle": "请输入文档标题。",
	"notice.fetchTitleFailed": "无法获取飞书文档标题。",
	"notice.templateNotFound": "未找到模板：{{path}}",
	"notice.addedLinkedDocument": "已添加关联飞书文档：{{title}}",
	"notice.addLinkedDocumentFailed": "添加关联飞书文档失败：{{message}}",
	"notice.createdDocument": "已创建飞书文档：{{title}}",
	"notice.createDocumentFailed": "创建飞书文档失败：{{message}}",
	"notice.syncedFeishuTitle": "已同步飞书标题：{{name}}",
	"notice.baseCreateFailed": "Obsidian Feishu 已加载，但创建飞书文档 Base 失败：{{message}}",
	"notice.baseFileNotFound": "未找到 Base 文件：{{path}}",
	"notice.noFrontMatterFound": "未找到 Front matter。",
	"notice.removedAssociation": "已从 {{name}} 移除飞书关联",
	"notice.associationSaved": "已保存 {{name}} 的飞书关联",

	"view.defaultTitle": "飞书文档",
	"view.displayPrefix": "飞书：{{title}}",
	"view.syncAction": "同步飞书标题和文件名",
	"view.noLinkedFile": "没有可同步的关联 Obsidian 文件。",
	"view.syncUnavailable": "当前视图不可同步。",
	"view.linkedFileNotFound": "未找到关联的 Obsidian 文件。",
	"view.titleAlreadyUpToDate": "飞书标题已经是最新。",
	"view.syncFailed": "同步飞书标题失败：{{message}}",
	"view.emptyState": "打开包含飞书 Front matter 的笔记后，可在这里查看文档。",

	"shadow.title": "影子文件",
	"shadow.description": "这篇笔记是飞书（Lark）知识库文档的本地代理。",
	"shadow.wikiUrl": "Wiki URL",
	"shadow.nodeInfo": "节点信息（通过 lark-cli）",
	"shadow.footer": "这个文件只保存 Front matter 元数据。完整内容仍在飞书中，可通过上面的 Wiki URL 查看。",

	"base.feishuTitle": "飞书标题",
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
