import { Plugin, WorkspaceLeaf, Menu, Notice, setIcon, Events } from "obsidian";
import { SettingsTab } from "./settingsTab";
import { CanvasFormatBrushSettings, DEFAULT_SETTINGS } from "./settings";

// Define interfaces for Canvas API
interface CanvasNodeData {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    borderColor?: string;
    backgroundColor?: string;
}

interface CanvasNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    borderColor?: string;
    backgroundColor?: string;
    // Methods that might be available
    setColor?: (color: string) => void;
    setBorderColor?: (color: string) => void;
    setBackgroundColor?: (color: string) => void;
    setDimensions?: (width: number, height: number) => void;
    // Data property that might contain the actual node data
    data?: CanvasNodeData;
}

interface Canvas {
    nodes: Map<string, CanvasNode>;
    selection: Set<any>; // Changed from Set<string> to Set<any> to handle object selections
    requestSave: () => void;
    // Additional properties that might be available
    getData?: () => any;
    getElement?: (id: string) => CanvasNode;
    getSelection?: () => any[];
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
                console.log("Copy command check - Canvas view:", !!canvasView);

                if (canvasView) {
                    console.log(
                        "Canvas selection size:",
                        canvasView.canvas.selection.size,
                    );
                    console.log(
                        "Canvas selection:",
                        Array.from(canvasView.canvas.selection),
                    );
                    console.log(
                        "Canvas nodes count:",
                        canvasView.canvas.nodes.size,
                    );

                    // Log first few node keys for debugging
                    const nodeKeys = Array.from(
                        canvasView.canvas.nodes.keys(),
                    ).slice(0, 3);
                    console.log("Sample node keys:", nodeKeys);
                }

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
                console.log("Paste command check - Canvas view:", !!canvasView);

                if (canvasView) {
                    console.log(
                        "Canvas selection size:",
                        canvasView.canvas.selection.size,
                    );
                }

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

        // Register context menu event for file menu (which includes canvas menus)
        this.registerEvent(
            this.app.workspace.on(
                "file-menu",
                (menu: Menu, file: any, source: string) => {
                    console.log("File menu event - Source:", source);

                    // Only add menu items if we're in a canvas view with a selection
                    const canvasView = this.getActiveCanvasView();
                    if (
                        canvasView &&
                        source === "canvas-menu" &&
                        canvasView.canvas.selection.size > 0
                    ) {
                        console.log("Adding canvas format brush menu items");

                        // Add separator
                        menu.addSeparator();

                        // Add copy format option if only one node is selected
                        if (canvasView.canvas.selection.size === 1) {
                            menu.addItem((item) => {
                                item.setTitle("Copy format")
                                    .setIcon("clipboard-copy")
                                    .onClick(() => this.copyFormat(canvasView))
                                    .setSection("canvas-format-brush");
                            });
                        }

                        // Add paste format option if we have a copied format
                        if (this.copiedFormat) {
                            menu.addItem((item) => {
                                item.setTitle("Paste format")
                                    .setIcon("clipboard-paste")
                                    .onClick(() => this.pasteFormat(canvasView))
                                    .setSection("canvas-format-brush");
                            });
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
                        console.log("Active leaf changed to canvas view");
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

        // Log that plugin is loaded
        console.log("Canvas Format Brush plugin loaded");
    }

    onunload() {
        // Clean up status bar
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
        console.log("Canvas Format Brush plugin unloaded");
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
            console.log("Found active canvas view");

            // Log the structure of the view for debugging
            const view = activeLeaf.view as unknown as CanvasView;
            console.log("Canvas view structure:", Object.keys(view));

            if (view.canvas) {
                console.log("Canvas properties:", Object.keys(view.canvas));
                console.log("Has nodes:", !!view.canvas.nodes);
                console.log("Has selection:", !!view.canvas.selection);
            } else {
                console.log("Canvas property missing from view");
            }

            return view;
        }
        console.log("No active canvas view found");
        return null;
    }

    // Get node data safely, handling different possible structures
    getNodeData(node: any): CanvasNodeData | null {
        if (!node) {
            console.log("getNodeData: Node is null or undefined");
            return null;
        }

        console.log("Node structure:", Object.keys(node));

        // If node is already a simple object with the properties we need, use it directly
        if (
            typeof node === "object" &&
            node.x !== undefined &&
            node.width !== undefined
        ) {
            console.log("Node appears to be a direct data object");
            return node;
        }

        // If node has a data property, use it
        if (node.data) {
            console.log("Using node.data");
            return node.data;
        }

        // Check if node is a CanvasNode
        if (node.id && (node.width !== undefined || node.color !== undefined)) {
            console.log("Using node directly");
            return node as CanvasNodeData;
        }

        // Try to access node properties through other possible structures
        if (typeof node.getPosition === "function") {
            console.log("Node has getPosition method");
        }

        if (typeof node.getSize === "function") {
            console.log("Node has getSize method");
        }

        console.log("Could not determine node structure");
        return null;
    }

    copyFormatFromNode(node: any) {
        console.log("copyFormatFromNode called with node:", !!node);

        const nodeData = this.getNodeData(node);
        if (!nodeData) {
            console.log("Failed to get node data");
            new Notice("Could not access canvas element data");
            return;
        }

        console.log("Node data:", nodeData);

        // Create a new format object
        this.copiedFormat = {};

        // Copy only the attributes that are enabled in settings
        if (this.settings.copyColor && nodeData.color) {
            console.log("Copying color:", nodeData.color);
            this.copiedFormat.color = nodeData.color;
        }

        if (this.settings.copySize) {
            console.log("Copying size:", nodeData.width, "x", nodeData.height);
            this.copiedFormat.width = nodeData.width;
            this.copiedFormat.height = nodeData.height;
        }

        if (this.settings.copyBorderColor && nodeData.borderColor) {
            console.log("Copying border color:", nodeData.borderColor);
            this.copiedFormat.borderColor = nodeData.borderColor;
        }

        if (this.settings.copyBackgroundColor && nodeData.backgroundColor) {
            console.log("Copying background color:", nodeData.backgroundColor);
            this.copiedFormat.backgroundColor = nodeData.backgroundColor;
        }

        console.log("Copied format:", this.copiedFormat);

        // Show a notice
        new Notice("Format copied from canvas element");

        // Update status bar
        this.updateStatusBar();
    }

    pasteFormatToNode(node: any) {
        if (!this.copiedFormat) {
            new Notice("No format copied");
            return;
        }

        console.log("pasteFormatToNode called with node:", !!node);

        const nodeData = this.getNodeData(node);
        if (!nodeData) {
            console.log("Failed to get node data for paste");
            new Notice("Could not access canvas element data");
            return;
        }

        console.log("Pasting format:", this.copiedFormat);

        // Apply only the attributes that were copied
        if (this.copiedFormat.color !== undefined) {
            // Try using setter method if available
            if (node.setColor) {
                console.log("Using setColor method");
                node.setColor(this.copiedFormat.color);
            } else {
                // Otherwise, set property directly
                console.log("Setting color property directly");
                nodeData.color = this.copiedFormat.color;
            }
        }

        if (
            this.copiedFormat.width !== undefined &&
            this.copiedFormat.height !== undefined
        ) {
            // Try using setter method if available
            if (node.setDimensions) {
                console.log("Using setDimensions method");
                node.setDimensions(
                    this.copiedFormat.width,
                    this.copiedFormat.height,
                );
            } else {
                // Otherwise, set properties directly
                console.log("Setting size properties directly");
                nodeData.width = this.copiedFormat.width;
                nodeData.height = this.copiedFormat.height;
            }
        }

        if (this.copiedFormat.borderColor !== undefined) {
            // Try using setter method if available
            if (node.setBorderColor) {
                console.log("Using setBorderColor method");
                node.setBorderColor(this.copiedFormat.borderColor);
            } else {
                // Otherwise, set property directly
                console.log("Setting borderColor property directly");
                nodeData.borderColor = this.copiedFormat.borderColor;
            }
        }

        if (this.copiedFormat.backgroundColor !== undefined) {
            // Try using setter method if available
            if (node.setBackgroundColor) {
                console.log("Using setBackgroundColor method");
                node.setBackgroundColor(this.copiedFormat.backgroundColor);
            } else {
                // Otherwise, set property directly
                console.log("Setting backgroundColor property directly");
                nodeData.backgroundColor = this.copiedFormat.backgroundColor;
            }
        }
    }

    copyFormat(canvasView: CanvasView) {
        try {
            console.log("copyFormat called");

            // Get the selected node
            const selectedElements = Array.from(canvasView.canvas.selection);
            console.log("Selected elements:", selectedElements);

            if (selectedElements.length === 0) {
                console.log("No elements selected");
                new Notice("No canvas element selected");
                return;
            }

            // The selection is the actual node object, not just an ID
            const selectedNode = selectedElements[0];
            console.log("Selected node type:", typeof selectedNode);

            if (!selectedNode) {
                console.log("Selected node is null");
                new Notice("No canvas element selected");
                return;
            }

            this.copyFormatFromNode(selectedNode);
        } catch (error) {
            console.error("Error copying format:", error);
            new Notice("Error copying format. Please try again.");
        }
    }

    pasteFormat(canvasView: CanvasView) {
        if (!this.copiedFormat) {
            new Notice("No format copied");
            return;
        }

        try {
            console.log("pasteFormat called");

            // Get all selected nodes
            const selectedElements = Array.from(canvasView.canvas.selection);
            console.log("Selected elements for paste:", selectedElements);

            if (selectedElements.length === 0) {
                console.log("No elements selected for paste");
                new Notice("No canvas elements selected");
                return;
            }

            // Apply format to all selected nodes
            let modifiedCount = 0;
            for (const node of selectedElements) {
                if (node) {
                    this.pasteFormatToNode(node);
                    modifiedCount++;
                }
            }

            console.log("Modified node count:", modifiedCount);

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
        } catch (error) {
            console.error("Error pasting format:", error);
            new Notice("Error pasting format. Please try again.");
        }
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
