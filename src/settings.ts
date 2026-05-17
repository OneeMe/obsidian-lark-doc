import {App, PluginSettingTab, Setting} from "obsidian";
import type ObsidianFeishuPlugin from "./main";

export interface ObsidianFeishuSettings {
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
	larkCliPath: "lark-cli",
	defaultNoteFolder: "Feishu",
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
		new Setting(containerEl)
			.setName("Connection")
			.setHeading();

		new Setting(containerEl)
			.setName("Lark CLI path")
			.setDesc("Path to the Lark CLI executable.")
			.addText(text => text
				.setPlaceholder("Lark CLI")
				.setValue(this.plugin.settings.larkCliPath)
				.onChange(async (value) => {
					this.plugin.settings.larkCliPath = value.trim() || "lark-cli";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Default note folder")
			.setDesc("Vault folder where new Feishu-linked notes are created.")
			.addText(text => text
				.setPlaceholder("Feishu")
				.setValue(this.plugin.settings.defaultNoteFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultNoteFolder = value.trim() || "Feishu";
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Auto-open Feishu view")
			.setDesc("Automatically open the Feishu document preview when you open a linked note.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenFeishuView)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenFeishuView = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Sync title from Feishu")
			.setDesc("Fetch the latest title from Feishu when opening a linked note.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTitle)
				.onChange(async (value) => {
					this.plugin.settings.syncTitle = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Sync title to filename")
			.setDesc("Rename the Obsidian note file when the Feishu title changes.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.syncTitleToFilename)
				.onChange(async (value) => {
					this.plugin.settings.syncTitleToFilename = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Background sync interval (minutes)")
			.setDesc("How often to check for title changes in the background (0 = disabled).")
			.addSlider(slider => slider
				.setLimits(0, 60, 5)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Note template")
			.setDesc("Optional template file (vault path) for new notes. Front matter is prepended automatically.")
			.addText(text => text
				.setPlaceholder("Templates/Feishu Note.md")
				.setValue(this.plugin.settings.noteTemplate)
				.onChange(async (value) => {
					this.plugin.settings.noteTemplate = value.trim();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Preview frame")
			.setHeading();

		new Setting(containerEl)
			.setName("Zoom level")
			.setDesc("Scale the Feishu document preview (0.5 = half size, 1.5 = 150%).")
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
			.setName("Hide Feishu header")
			.setDesc("Inject CSS to hide the Feishu document top navigation bar for a cleaner view.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hideFeishuHeader)
				.onChange(async (value) => {
					this.plugin.settings.hideFeishuHeader = value;
					await this.plugin.saveSettings();
					this.plugin.refreshFeishuViews();
				}));

		new Setting(containerEl)
			.setName("Custom CSS")
			.setDesc("Additional CSS to inject into the Feishu preview frame.")
			.addTextArea(textarea => textarea
				.setPlaceholder(".header { display: none !important; }")
				.setValue(this.plugin.settings.frameCustomCss)
				.onChange(async (value) => {
					this.plugin.settings.frameCustomCss = value;
					await this.plugin.saveSettings();
					this.plugin.refreshFeishuViews();
				}));
	}
}
