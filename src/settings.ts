import { Plugin } from "obsidian";

export interface CanvasFormatBrushSettings {
    copyColor: boolean;
    copySize: boolean;
    copyBorderColor: boolean;
    copyBackgroundColor: boolean;
    enableHotkeys: boolean;
    copyFormatHotkey: string;
    pasteFormatHotkey: string;
    showStatusBarItem: boolean;
}

export const DEFAULT_SETTINGS: CanvasFormatBrushSettings = {
    copyColor: true,
    copySize: true,
    copyBorderColor: true,
    copyBackgroundColor: true,
    enableHotkeys: true,
    copyFormatHotkey: "Ctrl+Shift+C",
    pasteFormatHotkey: "Ctrl+Shift+V",
    showStatusBarItem: true,
};
