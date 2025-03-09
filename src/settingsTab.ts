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

        // General Settings
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

        // Format Attributes
        new Setting(containerEl)
            .setName("Format attribute")
            .setDesc(
                "These attributes are applied when using the 'Copy format' command, whether through the command palette or the canvas context menu.",
            )
            .setHeading();

        new Setting(containerEl)
            .setName("Copy size")
            .setDesc("Copy the size from canvas element")
            .addToggle((toggle: ToggleComponent) =>
                toggle
                    .setValue(this.plugin.settings.copySize)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.copySize = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("Copy color")
            .setDesc("Copy the color from canvas element")
            .addToggle((toggle: ToggleComponent) =>
                toggle
                    .setValue(this.plugin.settings.copyColor)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.copyColor = value;
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
