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
}

interface CanvasNode {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    // Methods that might be available
    setColor?: (color: string) => void;
    setDimensions?: (width: number, height: number) => void;
    // Data property that might contain the actual node data
    data?: CanvasNodeData;
}

interface Canvas {
    nodes: Map<string, CanvasNode>;
    selection: Set<any>; // Changed from Set<string> to Set<any> to handle object selections
    requestSave: () => void;
    getData?: () => any;
    getElement?: (id: string) => CanvasNode;
    getSelection?: () => any[];
    wrapperEl?: HTMLElement;
    requestFrame?: () => void;
    render?: () => void;
    requestPushHistory?: () => void;
    dirty?: boolean;
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

    copyFormatFromNode(node: any) {
        console.log("copyFormatFromNode called with node:", !!node);

        try {
            // Log node structure for debugging
            if (node) {
                console.log("Node type:", typeof node);
                console.log(
                    "Node constructor name:",
                    node.constructor ? node.constructor.name : "Unknown",
                );
                console.log("Node properties:", Object.keys(node));
                console.log("Node ID:", node.id);

                // Check for specific type of node
                if (node.text !== undefined) {
                    console.log("Node appears to be a text node");
                }
            }

            // Make a clean copy of just what we need
            this.copiedFormat = {};

            // We'll copy directly from node properties to avoid data structure issues
            if (this.settings.copyColor && node.color !== undefined) {
                console.log("Copying color:", node.color);
                this.copiedFormat.color = String(node.color);
            }

            if (
                this.settings.copySize &&
                node.width !== undefined &&
                node.height !== undefined
            ) {
                console.log("Copying size:", node.width, "x", node.height);
                this.copiedFormat.width = Number(node.width);
                this.copiedFormat.height = Number(node.height);
            }

            console.log("Copied format:", this.copiedFormat);

            // Show a notice
            new Notice("Format copied from canvas element");

            // Update status bar
            this.updateStatusBar();
        } catch (error) {
            console.error("Error in copyFormatFromNode:", error);
            new Notice("Error copying format");
        }
    }

    pasteFormatToNode(node: any, canvasView: CanvasView) {
        if (!this.copiedFormat) {
            new Notice("No format copied");
            return false;
        }

        console.log("pasteFormatToNode called with node:", !!node);

        try {
            // Instead of modifying the node directly, we'll work with the canvas data
            // This ensures that Obsidian's internal state remains consistent

            console.log("Node ID:", node.id);
            console.log("Node current color:", node.color);
            console.log("Node current size:", node.width, "x", node.height);

            // Capture original values before changes
            const originalValues = {
                id: node.id,
                color: node.color,
                width: node.width,
                height: node.height,
            };

            console.log("Original values:", originalValues);

            // Create a list of changes to apply with proper type definition
            interface CanvasNodeChanges {
                color?: string;
                width?: number;
                height?: number;
            }

            let changes: CanvasNodeChanges = {};
            let changesMade = false;

            if (this.copiedFormat.color !== undefined) {
                changes.color = this.copiedFormat.color;
                changesMade = true;
            }

            if (
                this.copiedFormat.width !== undefined &&
                this.copiedFormat.height !== undefined
            ) {
                changes.width = this.copiedFormat.width;
                changes.height = this.copiedFormat.height;
                changesMade = true;
            }

            if (!changesMade) {
                console.log("No changes to apply");
                return false;
            }

            console.log("Changes to apply:", changes);

            // First, try to use the best available methods
            let useDirectMethods = true;

            if (useDirectMethods) {
                // Try the standard methods first
                try {
                    // Apply color
                    if (
                        changes.color !== undefined &&
                        typeof node.setColor === "function"
                    ) {
                        console.log("Applying color via setColor");
                        node.setColor(changes.color);
                    }

                    // Apply size - this is the tricky one
                    if (
                        changes.width !== undefined &&
                        changes.height !== undefined
                    ) {
                        // Try different approaches based on node type
                        if (typeof node.setDimensions === "function") {
                            console.log("Applying size via setDimensions");
                            node.setDimensions(changes.width, changes.height);
                        } else if (typeof node.resize === "function") {
                            console.log("Applying size via resize");
                            node.resize(changes.width, changes.height);
                        }

                        // Some nodes need their bbox updated directly
                        if (node.bbox) {
                            console.log("Updating bbox size directly");
                            node.bbox.width = changes.width;
                            node.bbox.height = changes.height;
                        }

                        // Ensure the node's width/height are set directly as well
                        console.log("Setting width/height directly");
                        node.width = changes.width;
                        node.height = changes.height;
                    }

                    // Try to update the node's visual representation if needed
                    if (typeof node.update === "function") {
                        console.log("Calling node.update()");
                        node.update();
                    }

                    // The next step is the critical part - ensure the canvas knows about our changes
                    this.ensureCanvasUpdate(canvasView, node);

                    return true;
                } catch (e) {
                    console.error(
                        "Error applying changes with direct methods:",
                        e,
                    );
                    // If direct methods fail, we'll try a different approach
                }
            }

            return false;
        } catch (error) {
            console.error("Error applying format to node:", error);
            return false;
        }
    }

    // Special method to ensure the canvas is properly updated
    ensureCanvasUpdate(canvasView: CanvasView, node: any) {
        console.log("Ensuring canvas update for node:", node.id);

        try {
            // First, attempt to update the node in the canvas nodes map
            if (
                canvasView.canvas.nodes &&
                canvasView.canvas.nodes.has(node.id)
            ) {
                console.log("Node found in canvas nodes map");
            }

            // Essential - save the changes
            console.log("Requesting canvas save");
            canvasView.canvas.requestSave();

            // Try to trigger visual updates
            if (typeof canvasView.canvas.requestFrame === "function") {
                console.log("Requesting canvas frame update");
                canvasView.canvas.requestFrame();
            }

            // Create a very small timeout to allow the canvas to process updates
            setTimeout(() => {
                if (typeof canvasView.canvas.requestFrame === "function") {
                    console.log("Delayed requesting canvas frame update");
                    canvasView.canvas.requestFrame();
                }

                if (typeof canvasView.canvas.render === "function") {
                    console.log("Delayed requesting canvas render");
                    canvasView.canvas.render();
                }
            }, 50);
        } catch (e) {
            console.error("Error ensuring canvas update:", e);
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
            console.log("Canvas object:", Object.keys(canvasView.canvas));

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
                    // We now pass canvasView to pasteFormatToNode
                    const wasModified = this.pasteFormatToNode(
                        node,
                        canvasView,
                    );
                    if (wasModified) {
                        modifiedCount++;
                    }
                }
            }

            console.log("Modified node count:", modifiedCount);

            if (modifiedCount > 0) {
                // Show a notice
                new Notice(
                    `Format applied to ${modifiedCount} canvas element${modifiedCount > 1 ? "s" : ""}`,
                );

                // Request save one more time at the end
                console.log("Final requestSave() call");
                canvasView.canvas.requestSave();

                // Do one final delayed update
                setTimeout(() => {
                    if (typeof canvasView.canvas.requestFrame === "function") {
                        console.log("Final delayed frame update");
                        canvasView.canvas.requestFrame();
                    }
                }, 100);
            } else {
                new Notice("Failed to apply any formatting");
            }
        } catch (error) {
            console.error("Error pasting format:", error);
            new Notice("Error pasting format. Please try again.");
        }
    }

    // Get node data safely, handling different possible structures
    getNodeData(node: any): CanvasNodeData | null {
        try {
            console.log("getNodeData called with node:", !!node);

            // Check if node is null or undefined
            if (!node) {
                console.log("Node is null or undefined");
                return null;
            }

            // Log node structure for debugging
            console.log("Node structure:", Object.keys(node));

            // Approach 1: Check if node is already a data object (has x, y, width, height)
            if (
                typeof node.x === "number" &&
                typeof node.y === "number" &&
                typeof node.width === "number" &&
                typeof node.height === "number"
            ) {
                console.log("Node appears to be a direct data object");
                return node;
            }

            // Approach 2: Check if node has a data property
            if (node.data && typeof node.data === "object") {
                console.log("Node has a data property");
                return node.data;
            }

            // Approach 3: Check if node has a getData method
            if (typeof node.getData === "function") {
                console.log("Node has a getData method");
                const data = node.getData();
                if (data) return data;
            }

            // Approach 4: For some node types, x, y, width, height might be direct properties
            // but not in a data object
            if (node.width !== undefined && node.height !== undefined) {
                console.log("Node has width/height as direct properties");
                // Create a copy of the properties we need
                return {
                    id: node.id,
                    x: node.x,
                    y: node.y,
                    width: node.width,
                    height: node.height,
                    color: node.color,
                };
            }

            // Approach 5: Check if node has a bbox property
            if (node.bbox && typeof node.bbox === "object") {
                console.log("Node has a bbox property");
                // Create a data structure from bbox
                return {
                    id: node.id,
                    x: node.x,
                    y: node.y,
                    width: node.bbox.width,
                    height: node.bbox.height,
                    color: node.color,
                };
            }

            console.log("Failed to get node data from node");
            return null;
        } catch (error) {
            console.error("Error in getNodeData:", error);
            return null;
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
