import { Plugin, WorkspaceLeaf, Menu, Notice, setIcon } from "obsidian";
import { SettingsTab } from "./settingsTab";
import { CanvasFormatBrushSettings, DEFAULT_SETTINGS } from "./settings";

// Define interfaces for Canvas API
interface CanvasNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    borderColor?: string;
    backgroundColor?: string;
}

interface Canvas {
    nodes: Map<string, CanvasNode>;
    selection: Set<string>;
    requestSave: () => void;
}

interface CanvasView {
    canvas: Canvas;
    menu?: Menu;
    getViewType: () => string;
}

export default class CanvasFormatBrushPlugin extends Plugin {
    settings: CanvasFormatBrushSettings;
    statusBarItem: HTMLElement | null = null;
    copiedFormat: {
        color?: string;
        width?: number;
        height?: number;
        borderColor?: string;
        backgroundColor?: string;
    } | null = null;

    async onload() {
        await this.loadSettings();

        // Add settings tab
        this.addSettingTab(new SettingsTab(this.app, this));

        // Register commands
        this.addCommand({
            id: "copy-canvas-format",
            name: "Copy format from selected canvas element",
            checkCallback: (checking: boolean) => {
                const canvasView = this.getActiveCanvasView();
                if (canvasView && canvasView.canvas.selection.size === 1) {
                    if (!checking) {
                        this.copyFormat(canvasView);
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "paste-canvas-format",
            name: "Paste format to selected canvas elements",
            checkCallback: (checking: boolean) => {
                const canvasView = this.getActiveCanvasView();
                if (
                    canvasView &&
                    canvasView.canvas.selection.size > 0 &&
                    this.copiedFormat
                ) {
                    if (!checking) {
                        this.pasteFormat(canvasView);
                    }
                    return true;
                }
                return false;
            },
        });

        // Register context menu event
        this.registerEvent(
            this.app.workspace.on(
                "file-menu",
                (menu: Menu, file: any, source: string) => {
                    // Only add menu items if we're in a canvas view
                    const canvasView = this.getActiveCanvasView();
                    if (canvasView && source === "canvas-menu") {
                        // Only add menu items if there is a selection
                        if (canvasView.canvas.selection.size > 0) {
                            menu.addItem((item) => {
                                item.setTitle("Copy format")
                                    .setIcon("clipboard-copy")
                                    .onClick(() => this.copyFormat(canvasView))
                                    .setSection("canvas-format-brush");
                            });

                            // Only enable paste if we have a copied format
                            if (this.copiedFormat) {
                                menu.addItem((item) => {
                                    item.setTitle("Paste format")
                                        .setIcon("clipboard-paste")
                                        .onClick(() =>
                                            this.pasteFormat(canvasView),
                                        )
                                        .setSection("canvas-format-brush");
                                });
                            }
                        }
                    }
                },
            ),
        );

        // Register status bar
        this.registerEvent(
            this.app.workspace.on(
                "active-leaf-change",
                (leaf: WorkspaceLeaf | null) => {
                    // Check if the active leaf is a canvas view
                    if (
                        leaf &&
                        leaf.view &&
                        leaf.view.getViewType() === "canvas"
                    ) {
                        this.updateStatusBar();
                    } else {
                        // Hide status bar if not in canvas view
                        if (this.statusBarItem) {
                            this.statusBarItem.style.display = "none";
                        }
                    }
                },
            ),
        );

        // Initialize status bar
        this.initStatusBar();
    }

    onunload() {
        // Clean up status bar
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
    }

    async loadSettings() {
        this.settings = Object.assign(
            {},
            DEFAULT_SETTINGS,
            await this.loadData(),
        );
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    getActiveCanvasView(): CanvasView | null {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (
            activeLeaf &&
            activeLeaf.view &&
            activeLeaf.view.getViewType() === "canvas"
        ) {
            return activeLeaf.view as unknown as CanvasView;
        }
        return null;
    }

    copyFormat(canvasView: CanvasView) {
        // Get the selected node
        const selectedNodeId = Array.from(canvasView.canvas.selection)[0];
        const selectedNode = canvasView.canvas.nodes.get(selectedNodeId);

        if (!selectedNode) {
            new Notice("No canvas element selected");
            return;
        }

        // Create a new format object
        this.copiedFormat = {};

        // Copy only the attributes that are enabled in settings
        if (this.settings.copyColor && selectedNode.color) {
            this.copiedFormat.color = selectedNode.color;
        }

        if (this.settings.copySize) {
            this.copiedFormat.width = selectedNode.width;
            this.copiedFormat.height = selectedNode.height;
        }

        if (this.settings.copyBorderColor && selectedNode.borderColor) {
            this.copiedFormat.borderColor = selectedNode.borderColor;
        }

        if (this.settings.copyBackgroundColor && selectedNode.backgroundColor) {
            this.copiedFormat.backgroundColor = selectedNode.backgroundColor;
        }

        // Show a notice
        new Notice("Format copied from canvas element");

        // Update status bar
        this.updateStatusBar();
    }

    pasteFormat(canvasView: CanvasView) {
        if (!this.copiedFormat) {
            new Notice("No format copied");
            return;
        }

        // Get all selected nodes
        const selectedNodeIds = Array.from(canvasView.canvas.selection);
        if (selectedNodeIds.length === 0) {
            new Notice("No canvas elements selected");
            return;
        }

        // Apply format to all selected nodes
        let modifiedCount = 0;
        for (const nodeId of selectedNodeIds) {
            const node = canvasView.canvas.nodes.get(nodeId);
            if (node) {
                modifiedCount++;

                // Apply only the attributes that were copied
                if (this.copiedFormat.color !== undefined) {
                    node.color = this.copiedFormat.color;
                }

                if (
                    this.copiedFormat.width !== undefined &&
                    this.copiedFormat.height !== undefined
                ) {
                    node.width = this.copiedFormat.width;
                    node.height = this.copiedFormat.height;
                }

                if (this.copiedFormat.borderColor !== undefined) {
                    node.borderColor = this.copiedFormat.borderColor;
                }

                if (this.copiedFormat.backgroundColor !== undefined) {
                    node.backgroundColor = this.copiedFormat.backgroundColor;
                }
            }
        }

        // Show a notice
        new Notice(
            `Format applied to ${modifiedCount} canvas element${modifiedCount > 1 ? "s" : ""}`,
        );

        // Force canvas to redraw
        // This is a hack, but it works to refresh the canvas view
        const event = new MouseEvent("mousemove", {
            view: window,
            bubbles: true,
            cancelable: true,
        });
        document.dispatchEvent(event);

        // Save changes
        canvasView.canvas.requestSave();
    }

    initStatusBar() {
        // Add status bar item
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass("canvas-format-brush-status");

        // Initialize with empty state
        this.updateStatusBar();
    }

    updateStatusBar() {
        if (!this.statusBarItem) return;

        // Only show if enabled in settings and we're in a canvas view
        const canvasView = this.getActiveCanvasView();
        if (!this.settings.showStatusBarItem || !canvasView) {
            this.statusBarItem.style.display = "none";
            return;
        }

        this.statusBarItem.style.display = "block";
        this.statusBarItem.empty();

        const container = this.statusBarItem.createEl("div", {
            cls: "canvas-format-brush-container",
        });

        // Icon
        const iconEl = container.createEl("div", {
            cls: "canvas-format-brush-icon",
        });
        setIcon(iconEl, "brush");

        // Text
        const textEl = container.createEl("span", {
            cls: "canvas-format-brush-text",
        });

        if (this.copiedFormat) {
            textEl.setText("Format copied");

            // Add color preview if color was copied
            if (this.copiedFormat.color) {
                const colorPreview = container.createEl("div", {
                    cls: "canvas-format-brush-color-preview",
                });
                colorPreview.style.backgroundColor = this.copiedFormat.color;
            }
        } else {
            textEl.setText("No format copied");
        }
    }
}
