import {
    App,
    PluginSettingTab,
    Setting,
    ToggleComponent,
    TextComponent,
} from "obsidian";
import type CanvasFormatBrushPlugin from "./main";

export class SettingsTab extends PluginSettingTab {
    plugin: CanvasFormatBrushPlugin;

    constructor(app: App, plugin: CanvasFormatBrushPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Canvas Format Brush settings" });

        // Format Attributes Section
        containerEl.createEl("h3", { text: "Format attributes" });

        new Setting(containerEl)
            .setName("Copy color")
            .setDesc("Copy the color of the canvas element")
            .addToggle((toggle: ToggleComponent) =>
                toggle
                    .setValue(this.plugin.settings.copyColor)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.copyColor = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Copy size")
            .setDesc("Copy the size of the canvas element")
            .addToggle((toggle: ToggleComponent) =>
                toggle
                    .setValue(this.plugin.settings.copySize)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.copySize = value;
                        await this.plugin.saveSettings();
                    }),
            );

        // Hotkeys Section
        containerEl.createEl("h3", { text: "Hotkeys" });

        new Setting(containerEl)
            .setName("Enable hotkeys")
            .setDesc("Enable hotkeys for copy and paste format")
            .addToggle((toggle: ToggleComponent) =>
                toggle
                    .setValue(this.plugin.settings.enableHotkeys)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.enableHotkeys = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Copy format hotkey")
            .setDesc("Hotkey to copy format (set in Obsidian hotkeys settings)")
            .setDisabled(!this.plugin.settings.enableHotkeys)
            .addText((text: TextComponent) =>
                text
                    .setPlaceholder("Ctrl+Shift+C")
                    .setValue(this.plugin.settings.copyFormatHotkey)
                    .setDisabled(true),
            );

        new Setting(containerEl)
            .setName("Paste format hotkey")
            .setDesc(
                "Hotkey to paste format (set in Obsidian hotkeys settings)",
            )
            .setDisabled(!this.plugin.settings.enableHotkeys)
            .addText((text: TextComponent) =>
                text
                    .setPlaceholder("Ctrl+Shift+V")
                    .setValue(this.plugin.settings.pasteFormatHotkey)
                    .setDisabled(true),
            );

        // UI Settings Section
        containerEl.createEl("h3", { text: "UI settings" });

        new Setting(containerEl)
            .setName("Show status bar item")
            .setDesc("Show format brush status in the status bar")
            .addToggle((toggle: ToggleComponent) =>
                toggle
                    .setValue(this.plugin.settings.showStatusBarItem)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.showStatusBarItem = value;
                        await this.plugin.saveSettings();
                        // Update status bar visibility
                        this.plugin.updateStatusBar();
                    }),
            );
    }
}
