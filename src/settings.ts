import {App, PluginSettingTab, Setting} from "obsidian";
import type ObsidianFeishuPlugin from "./main";

export interface ObsidianFeishuSettings {
	/** Whether to auto-open Feishu view when opening an associated note */
	autoOpenFeishuView: boolean;
	/** Whether to show the index panel on startup */
	showIndexPanel: boolean;
}

export const DEFAULT_SETTINGS: ObsidianFeishuSettings = {
	autoOpenFeishuView: true,
	showIndexPanel: false,
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
			.setName("Auto-open Feishu view")
			.setDesc("Automatically open the Feishu document view when you open a note that has a Feishu association.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoOpenFeishuView)
				.onChange(async (value) => {
					this.plugin.settings.autoOpenFeishuView = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Show index panel on startup")
			.setDesc("Show the Feishu index panel when Obsidian starts.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showIndexPanel)
				.onChange(async (value) => {
					this.plugin.settings.showIndexPanel = value;
					await this.plugin.saveSettings();
				}));
	}
}
