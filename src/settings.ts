import { Plugin } from "obsidian";

export interface CanvasFormatBrushSettings {
    copyColor: boolean;
    copySize: boolean;
    enableHotkeys: boolean;
    copyFormatHotkey: string;
    pasteFormatHotkey: string;
    showStatusBarItem: boolean;
}

export const DEFAULT_SETTINGS: CanvasFormatBrushSettings = {
    copyColor: true,
    copySize: true,
    enableHotkeys: true,
    copyFormatHotkey: "Ctrl+Shift+C",
    pasteFormatHotkey: "Ctrl+Shift+V",
    showStatusBarItem: true,
};
