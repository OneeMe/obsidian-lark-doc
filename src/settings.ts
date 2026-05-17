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
}

export const DEFAULT_SETTINGS: ObsidianFeishuSettings = {
	larkCliPath: "lark-cli",
	defaultNoteFolder: "Feishu",
	autoOpenFeishuView: true,
	syncTitle: true,
	syncTitleToFilename: false,
	syncIntervalMinutes: 0,
	noteTemplate: "",
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
		containerEl.createEl("h2", {text: "Obsidian Feishu Settings"});

		new Setting(containerEl)
			.setName("Lark CLI path")
			.setDesc("Path to the lark-cli executable.")
			.addText(text => text
				.setPlaceholder("lark-cli")
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
	}
}
