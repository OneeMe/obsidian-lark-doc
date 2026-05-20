import {App, PluginSettingTab, Setting} from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import {LANGUAGE_OPTIONS, type PluginLanguage} from "./i18n";

export interface ObsidianFeishuSettings {
	language: PluginLanguage;
	larkCliPath: string;
	defaultNoteFolder: string;
	autoOpenFeishuView: boolean;
	syncTitle: boolean;
	syncTitleToFilename: boolean;
	syncIntervalMinutes: number;
	noteTemplate: string;
	feishuTenantDomain: string;
	frameZoom: number;
	frameCustomCss: string;
	hideFeishuHeader: boolean;
}

export const DEFAULT_SETTINGS: ObsidianFeishuSettings = {
	language: "auto",
	larkCliPath: "lark-cli",
	defaultNoteFolder: "Lark",
	autoOpenFeishuView: true,
	syncTitle: true,
	syncTitleToFilename: false,
	syncIntervalMinutes: 0,
	noteTemplate: "",
	feishuTenantDomain: "my.feishu.cn",
	frameZoom: 1.0,
	frameCustomCss: "",
	hideFeishuHeader: true,
};

export class FeishuSettingTab extends PluginSettingTab {
	plugin: ObsidianFeishuPlugin;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		const t = this.plugin.t.bind(this.plugin);

		new Setting(containerEl)
			.setName(t("settings.interface"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.language.name"))
			.setDesc(t("settings.language.desc"))
			.addDropdown(dropdown => {
				for (const option of LANGUAGE_OPTIONS) {
					dropdown.addOption(option.value, t(option.labelKey));
				}
				dropdown
					.setValue(this.plugin.settings.language)
					.onChange(async (value) => {
						this.plugin.settings.language = value as PluginLanguage;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		new Setting(containerEl)
			.setName(t("settings.connection"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.larkCliPath.name"))
			.setDesc(t("settings.larkCliPath.desc"))
			.addText(text => text
				.setPlaceholder(t("settings.larkCliPath.placeholder"))
				.setValue(this.plugin.settings.larkCliPath)
				.onChange(async (value) => {
					this.plugin.settings.larkCliPath = value.trim() || "lark-cli";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.defaultNoteFolder.name"))
			.setDesc(t("settings.defaultNoteFolder.desc"))
			.addText(text => text
				.setPlaceholder("Lark")
				.setValue(this.plugin.settings.defaultNoteFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultNoteFolder = value.trim() || "Lark";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.autoOpenFeishuView.name"))
			.setDesc(t("settings.autoOpenFeishuView.desc"))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenFeishuView)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenFeishuView = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.syncTitle.name"))
			.setDesc(t("settings.syncTitle.desc"))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTitle)
				.onChange(async (value) => {
					this.plugin.settings.syncTitle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.syncTitleToFilename.name"))
			.setDesc(t("settings.syncTitleToFilename.desc"))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTitleToFilename)
				.onChange(async (value) => {
					this.plugin.settings.syncTitleToFilename = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.backgroundSyncInterval.name"))
			.setDesc(t("settings.backgroundSyncInterval.desc"))
			.addSlider(slider => slider
				.setLimits(0, 60, 5)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.noteTemplate.name"))
			.setDesc(t("settings.noteTemplate.desc"))
			.addText(text => text
				.setPlaceholder(t("settings.noteTemplate.placeholder"))
				.setValue(this.plugin.settings.noteTemplate)
				.onChange(async (value) => {
					this.plugin.settings.noteTemplate = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t("settings.previewFrame"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.zoomLevel.name"))
			.setDesc(t("settings.zoomLevel.desc"))
			.addSlider(slider => slider
				.setLimits(0.5, 2.0, 0.1)
				.setValue(this.plugin.settings.frameZoom)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.frameZoom = value;
					await this.plugin.saveSettings();
					this.plugin.refreshFeishuViews();
				}));

		new Setting(containerEl)
			.setName(t("settings.hideFeishuHeader.name"))
			.setDesc(t("settings.hideFeishuHeader.desc"))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideFeishuHeader)
				.onChange(async (value) => {
					this.plugin.settings.hideFeishuHeader = value;
					await this.plugin.saveSettings();
					this.plugin.refreshFeishuViews();
				}));

		new Setting(containerEl)
			.setName(t("settings.customCss.name"))
			.setDesc(t("settings.customCss.desc"))
			.addTextArea(textarea => textarea
				.setPlaceholder(t("settings.customCss.placeholder"))
				.setValue(this.plugin.settings.frameCustomCss)
				.onChange(async (value) => {
					this.plugin.settings.frameCustomCss = value;
					await this.plugin.saveSettings();
					this.plugin.refreshFeishuViews();
				}));
	}
}
