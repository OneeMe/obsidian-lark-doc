import {App, Component, Notice, Platform, PluginSettingTab, Setting} from "obsidian";
import type ObsidianFeishuPlugin from "./main";
import {LANGUAGE_OPTIONS, type PluginLanguage} from "./i18n";
import {
	addShortcutToAllowlist,
	cleanShortcutAllowlist,
	DEFAULT_SHORTCUT_ALLOWLIST,
	recordShortcutFromKeyboardEvent,
	removeShortcutFromAllowlist,
} from "./shortcut-routing";

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
	shortcutAllowlist: string[];
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
	shortcutAllowlist: [...DEFAULT_SHORTCUT_ALLOWLIST],
};

export class FeishuSettingTab extends PluginSettingTab {
	plugin: ObsidianFeishuPlugin;
	private recordingComponent: Component | undefined;

	constructor(app: App, plugin: ObsidianFeishuPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		this.cancelRecording();
		super.hide();
	}

	display(): void {
		this.cancelRecording();
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

		this.renderShortcutSettings(containerEl);
	}

	private renderShortcutSettings(containerEl: HTMLElement): void {
		const t = this.plugin.t.bind(this.plugin);

		new Setting(containerEl)
			.setName(t("settings.shortcutForwarding"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("settings.shortcutAllowlist.name"))
			.setDesc(t("settings.shortcutAllowlist.desc"))
			.addButton(button => {
				button
					.setButtonText(t("settings.shortcutAllowlist.record"))
					.setCta()
					.onClick(() => this.startRecording(button.buttonEl));
				button.buttonEl.setAttribute("aria-label", t("settings.shortcutAllowlist.record"));
			});

		const shortcuts = cleanShortcutAllowlist(this.plugin.settings.shortcutAllowlist, []);
		this.plugin.settings.shortcutAllowlist = shortcuts;

		if (shortcuts.length === 0) {
			new Setting(containerEl)
				.setName(t("settings.shortcutAllowlist.empty"))
				.setDesc(t("settings.shortcutAllowlist.emptyDesc"));
		} else {
			for (const shortcut of shortcuts) {
				new Setting(containerEl)
					.setName(shortcut)
					.addButton(button => {
						button
							.setIcon("trash")
							.setTooltip(t("settings.shortcutAllowlist.delete"))
							.onClick(async () => {
								this.plugin.settings.shortcutAllowlist = removeShortcutFromAllowlist(
									this.plugin.settings.shortcutAllowlist,
									shortcut
								);
								await this.plugin.saveSettings();
								this.display();
							});
						button.buttonEl.setAttribute("aria-label", t("settings.shortcutAllowlist.deleteShortcut", {shortcut}));
					});
			}
		}

		new Setting(containerEl)
			.setName(t("settings.shortcutAllowlist.manage"))
			.setDesc(t("settings.shortcutAllowlist.manageDesc"))
			.addButton(button => {
				button
					.setButtonText(t("settings.shortcutAllowlist.clear"))
					.setDisabled(shortcuts.length === 0)
					.onClick(async () => {
						this.plugin.settings.shortcutAllowlist = [];
						await this.plugin.saveSettings();
						this.display();
					});
			})
			.addButton(button => {
				button
					.setButtonText(t("settings.shortcutAllowlist.restoreDefaults"))
					.onClick(async () => {
						this.plugin.settings.shortcutAllowlist = [...DEFAULT_SHORTCUT_ALLOWLIST];
						await this.plugin.saveSettings();
						this.display();
					});
			});
	}

	private startRecording(buttonEl: HTMLButtonElement): void {
		this.cancelRecording();
		const t = this.plugin.t.bind(this.plugin);
		const doc = this.containerEl.ownerDocument;
		const platform = Platform.isMacOS ? "mac" : "other";
		const originalText = buttonEl.textContent ?? t("settings.shortcutAllowlist.record");

		buttonEl.textContent = t("settings.shortcutAllowlist.recording");
		buttonEl.addClass("is-recording");

		const keydownListener = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			const result = recordShortcutFromKeyboardEvent(event, platform);
			if (result.type === "cancelled") {
				this.cancelRecording();
				return;
			}
			if (result.type === "invalid" || !result.shortcut) {
				new Notice(t("settings.shortcutAllowlist.invalid"));
				return;
			}

			this.plugin.settings.shortcutAllowlist = addShortcutToAllowlist(
				this.plugin.settings.shortcutAllowlist,
				result.shortcut
			);
			void this.plugin.saveSettings().then(() => {
				this.cancelRecording();
				this.display();
			});
		};

		const component = new Component();
		component.registerDomEvent(doc, "keydown", keydownListener, {capture: true});
		component.register(() => {
			buttonEl.removeClass("is-recording");
			buttonEl.textContent = originalText;
			if (this.recordingComponent === component) {
				this.recordingComponent = undefined;
			}
		});
		this.recordingComponent = component;
	}

	private cancelRecording(): void {
		this.recordingComponent?.unload();
		this.recordingComponent = undefined;
	}
}
