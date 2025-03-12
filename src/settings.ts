import { Plugin } from "obsidian";

export interface CanvasFormatBrushSettings {
    copyColor: boolean;
    copySize: boolean;
    showStatusBarItem: boolean;
    debugMode: boolean;
}

export const DEFAULT_SETTINGS: CanvasFormatBrushSettings = {
    copyColor: true,
    copySize: true,
    showStatusBarItem: true,
    debugMode: false,
};
