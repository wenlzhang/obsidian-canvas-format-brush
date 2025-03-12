import {
    Plugin,
    WorkspaceLeaf,
    Menu,
    Notice,
    setIcon,
    Events,
    setTooltip,
    addIcon,
} from "obsidian";
import { SettingsTab } from "./settingsTab";
import { CanvasFormatBrushSettings, DEFAULT_SETTINGS } from "./settings";
import { log } from "./logger";

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
    setColor?: (color: string) => void;
    setDimensions?: (width: number, height: number) => void;
    data?: CanvasNodeData;
}

interface Canvas {
    nodes: Map<string, CanvasNode>;
    selection: Set<any>;
    requestSave: () => void;
    getData?: () => any;
    getElement?: (id: string) => CanvasNode;
    getSelection?: () => any[];
    wrapperEl?: HTMLElement;
    requestFrame?: () => void;
    render?: () => void;
    requestPushHistory?: () => void;
    dirty?: boolean;
    menu?: CanvasPopupMenu;
}

interface CanvasView {
    canvas: Canvas;
    menu?: Menu;
    getViewType: () => string;
}

// Interface for the canvas popup menu
interface CanvasPopupMenu {
    menuEl?: HTMLElement;
    render: () => void;
    hide: () => void;
    show: () => void;
    setTarget: (node: CanvasNode) => void;
}

export default class CanvasFormatBrushPlugin extends Plugin {
    settings: CanvasFormatBrushSettings;
    statusBarItem: HTMLElement | null = null;
    copiedFormat: {
        color?: string;
        width?: number;
        height?: number;
    } | null = null;

    // Track if we've patched the popup menu
    patchedPopupMenu = false;

    // Elements for the format brush buttons in popup menu
    copyFormatButton: HTMLElement | null = null;
    copyColorButton: HTMLElement | null = null;
    copySizeButton: HTMLElement | null = null;
    pasteFormatButton: HTMLElement | null = null;

    async onload() {
        await this.loadSettings();

        // Set debug mode based on settings
        log.setDebugMode(this.settings.debugMode);

        // Add settings tab
        this.addSettingTab(new SettingsTab(this.app, this));

        // Register commands
        this.addCommand({
            id: "copy-canvas-format",
            name: "Copy format",
            checkCallback: (checking: boolean) => {
                const canvasView = this.getActiveCanvasView();
                log.debug(`Copy command check - Canvas view: ${!!canvasView}`);

                if (canvasView) {
                    log.debug(
                        `Canvas selection size: ${canvasView.canvas.selection.size}`,
                    );

                    // Single debug statement for canvas information
                    if (this.settings.debugMode) {
                        log.debug("Canvas data", {
                            selection: Array.from(canvasView.canvas.selection),
                            nodesCount: canvasView.canvas.nodes.size,
                        });
                    }

                    // Log first few node keys for debugging
                    const nodeKeys = Array.from(
                        canvasView.canvas.nodes.keys(),
                    ).slice(0, 3);
                    log.debug("Sample node keys:", nodeKeys);
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

        // Add command to copy only the size
        this.addCommand({
            id: "copy-canvas-size",
            name: "Copy size",
            checkCallback: (checking: boolean) => {
                const canvasView = this.getActiveCanvasView();

                if (canvasView && canvasView.canvas.selection.size === 1) {
                    if (!checking) {
                        // Call a specialized version of copyFormat that only copies size
                        this.copyFormatSizeOnly(canvasView);
                    }
                    return true;
                }
                return false;
            },
        });

        // Add command to copy only the color
        this.addCommand({
            id: "copy-canvas-color",
            name: "Copy color",
            checkCallback: (checking: boolean) => {
                const canvasView = this.getActiveCanvasView();

                if (canvasView && canvasView.canvas.selection.size === 1) {
                    if (!checking) {
                        // Call a specialized version of copyFormat that only copies color
                        this.copyFormatColorOnly(canvasView);
                    }
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: "paste-canvas-format",
            name: "Paste format",
            checkCallback: (checking: boolean) => {
                const canvasView = this.getActiveCanvasView();
                log.debug(`Paste command check - Canvas view: ${!!canvasView}`);

                if (canvasView) {
                    log.debug(
                        `Canvas selection size: ${canvasView.canvas.selection.size}`,
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

        // Patch the canvas popup menu
        this.patchCanvasPopupMenu();

        // Initialize status bar
        this.initStatusBar();

        // Register for layout-ready event to set up format brush buttons when Obsidian is ready
        this.app.workspace.onLayoutReady(() => {
            this.patchCanvasPopupMenu();
        });

        // Register event for active leaf change to update UI
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
                        log.debug("Active leaf changed to canvas view");
                        this.updateStatusBar();

                        // Ensure popup menu is patched when switching to a canvas
                        this.patchCanvasPopupMenu();
                    } else {
                        // Hide status bar if not in canvas view
                        if (this.statusBarItem) {
                            this.statusBarItem.addClass("status-bar-hidden");
                            this.statusBarItem.removeClass(
                                "status-bar-visible",
                            );
                        }
                    }
                },
            ),
        );
    }

    onunload() {
        if (this.statusBarItem) {
            this.statusBarItem.remove();
        }
        log.info("Canvas Format Brush plugin unloaded");
    }

    // Patch the canvas popup menu to add our format brush buttons
    patchCanvasPopupMenu() {
        try {
            // Only patch once
            if (this.patchedPopupMenu) {
                log.debug("Canvas popup menu already patched");
                return;
            }

            log.debug("Setting up canvas context menu integration");

            // We need to wait for a canvas view to be active
            const patchMenu = () => {
                // Get the active canvas view
                const canvasView = this.getActiveCanvasView();
                if (!canvasView) {
                    log.debug(
                        "No active canvas view found, will try again later",
                    );
                    return false;
                }

                // Access the canvas instance
                const canvas = canvasView.canvas;
                if (!canvas || !canvas.menu) {
                    log.debug("Canvas or menu not found, will try again later");
                    return false;
                }

                const canvasMenu = canvas.menu;

                // We need to patch the render method of the canvas menu
                const originalRender = canvasMenu.render;

                // Override the render method
                canvasMenu.render = (...args: any[]) => {
                    // Call the original render method first to ensure all default menu items are rendered
                    const result = originalRender.apply(canvasMenu, args);

                    log.debug(
                        "Canvas menu render called, adding format brush button",
                    );

                    // Now add our custom button to the menu element
                    if (canvasMenu.menuEl) {
                        // Check if our button already exists to avoid duplicates
                        if (
                            !canvasMenu.menuEl.querySelector(
                                ".format-brush-menu-item",
                            )
                        ) {
                            // Create our format brush button
                            const buttonEl = document.createElement("button");
                            buttonEl.addClass(
                                "clickable-icon",
                                "format-brush-menu-item",
                            );

                            // Set the tooltip
                            setTooltip(buttonEl, "Format brush", {
                                placement: "top",
                            });

                            // Set the icon
                            setIcon(buttonEl, "brush");

                            // Add click event handler
                            buttonEl.addEventListener(
                                "click",
                                (evt: MouseEvent) => {
                                    evt.preventDefault();
                                    evt.stopPropagation();

                                    // Show format brush submenu
                                    this.showFormatBrushSubmenu(
                                        evt,
                                        canvasView,
                                    );
                                },
                            );

                            // Add the button to the menu
                            canvasMenu.menuEl.appendChild(buttonEl);
                            log.debug(
                                "Format brush button added to canvas menu",
                            );
                        }
                    }

                    return result;
                };

                // Force a render to make our button appear immediately
                if (typeof canvasMenu.render === "function") {
                    canvasMenu.render();
                }

                this.patchedPopupMenu = true;
                log.info("Canvas context menu integration set up successfully");

                return true;
            };

            // Try to patch the menu now
            if (!patchMenu()) {
                // If we couldn't patch it now, register for layout-change events
                // to try again when the layout changes (which might make a canvas active)
                const evt = this.app.workspace.on("layout-change", () => {
                    if (patchMenu()) {
                        // If we succeeded, unregister this event
                        this.app.workspace.offref(evt);
                    }
                });

                this.registerEvent(evt);
            }
        } catch (error) {
            console.error(
                "Error setting up canvas context menu integration:",
                error,
            );
        }
    }

    getActiveCanvasView(): CanvasView | null {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (
            activeLeaf &&
            activeLeaf.view &&
            activeLeaf.view.getViewType() === "canvas"
        ) {
            log.debug("Found active canvas view");

            // Log the structure of the view for debugging
            const view = activeLeaf.view as unknown as CanvasView;
            log.debug("Canvas view structure:", Object.keys(view));

            if (view.canvas) {
                // Group all debug info into a single log message
                if (this.settings.debugMode) {
                    log.debug("Canvas details:", {
                        properties: Object.keys(view.canvas),
                        hasNodes: !!view.canvas.nodes,
                        hasSelection: !!view.canvas.selection,
                    });
                }
            } else {
                log.error("Canvas property missing from view");
            }

            return view;
        }
        log.debug("No active canvas view found");
        return null;
    }

    copyFormatFromNode(node: any) {
        log.debug(`copyFormatFromNode called with node: ${!!node}`);

        try {
            // Log node structure for debugging
            if (node) {
                // Group all node debug info into a single log message
                if (this.settings.debugMode) {
                    log.debug("Node details", {
                        type: typeof node,
                        constructorName: node.constructor
                            ? node.constructor.name
                            : "Unknown",
                        properties: Object.keys(node),
                        id: node.id,
                        isTextNode: node.text !== undefined,
                    });
                }
            }

            // Make a clean copy of just what we need
            this.copiedFormat = {};

            // We'll copy directly from node properties to avoid data structure issues
            if (this.settings.copyColor && node.color !== undefined) {
                log.debug(`Copying color: ${node.color}`);
                this.copiedFormat.color = String(node.color);
            }

            if (
                this.settings.copySize &&
                node.width !== undefined &&
                node.height !== undefined
            ) {
                log.debug(`Copying size: ${node.width}x${node.height}`);
                this.copiedFormat.width = Number(node.width);
                this.copiedFormat.height = Number(node.height);
            }

            log.debug("Copied format:", this.copiedFormat);

            // Show a notice
            new Notice("Format copied from canvas element");

            // Update status bar
            this.updateStatusBar();
        } catch (error) {
            log.error("Error in copyFormatFromNode:", error);
            new Notice("Error copying format");
        }
    }

    copyFormatColorOnlyFromNode(node: any) {
        log.debug(`copyFormatColorOnlyFromNode called with node: ${!!node}`);

        try {
            // Log node structure for debugging
            if (node) {
                // Group all node debug info into a single log message
                if (this.settings.debugMode) {
                    log.debug("Node details", {
                        type: typeof node,
                        constructorName: node.constructor
                            ? node.constructor.name
                            : "Unknown",
                        properties: Object.keys(node),
                        id: node.id,
                        isTextNode: node.text !== undefined,
                    });
                }
            }

            // Make a clean copy of just what we need
            this.copiedFormat = {};

            // We'll copy directly from node properties to avoid data structure issues
            if (this.settings.copyColor && node.color !== undefined) {
                log.debug(`Copying color: ${node.color}`);
                this.copiedFormat.color = String(node.color);
            }

            log.debug("Copied format:", this.copiedFormat);

            // Show a notice
            new Notice("Color copied from canvas element");

            // Update status bar
            this.updateStatusBar();
        } catch (error) {
            log.error("Error in copyFormatColorOnlyFromNode:", error);
            new Notice("Error copying color");
        }
    }

    copyFormatSizeOnlyFromNode(node: any) {
        log.debug(`copyFormatSizeOnlyFromNode called with node: ${!!node}`);

        try {
            // Log node structure for debugging
            if (node) {
                // Group all node debug info into a single log message
                if (this.settings.debugMode) {
                    log.debug("Node details", {
                        type: typeof node,
                        constructorName: node.constructor
                            ? node.constructor.name
                            : "Unknown",
                        properties: Object.keys(node),
                        id: node.id,
                        isTextNode: node.text !== undefined,
                    });
                }
            }

            // Make a clean copy of just what we need
            this.copiedFormat = {};

            // We'll copy directly from node properties to avoid data structure issues
            if (
                this.settings.copySize &&
                node.width !== undefined &&
                node.height !== undefined
            ) {
                log.debug(`Copying size: ${node.width}x${node.height}`);
                this.copiedFormat.width = Number(node.width);
                this.copiedFormat.height = Number(node.height);
            }

            log.debug("Copied format:", this.copiedFormat);

            // Show a notice
            new Notice("Size copied from canvas element");

            // Update status bar
            this.updateStatusBar();
        } catch (error) {
            log.error("Error in copyFormatSizeOnlyFromNode:", error);
            new Notice("Error copying size");
        }
    }

    pasteFormatToNode(node: any, canvasView: CanvasView) {
        if (!this.copiedFormat) {
            new Notice("No format copied");
            return false;
        }

        log.debug(`pasteFormatToNode called with node: ${!!node}`);

        try {
            // Instead of modifying the node directly, we'll work with the canvas data
            // This ensures that Obsidian's internal state remains consistent

            // Group node info into a single debug message
            if (this.settings.debugMode) {
                log.debug("Node properties:", {
                    id: node.id,
                    color: node.color,
                    size: `${node.width}x${node.height}`,
                });
            }

            // Capture original values before changes
            const originalValues = {
                id: node.id,
                color: node.color,
                width: node.width,
                height: node.height,
            };

            log.debug("Original values:", originalValues);

            // Create a list of changes to apply with proper type definition
            interface CanvasNodeChanges {
                color?: string;
                width?: number;
                height?: number;
            }

            const changes: CanvasNodeChanges = {};
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
                log.debug("No changes to apply");
                return false;
            }

            log.debug("Changes to apply:", changes);

            // First, try to use the best available methods
            const useDirectMethods = true;

            if (useDirectMethods) {
                // Try the standard methods first
                try {
                    // Apply color
                    if (
                        changes.color !== undefined &&
                        typeof node.setColor === "function"
                    ) {
                        log.debug("Applying color via setColor");
                        node.setColor(changes.color);
                    }

                    // Apply size - this is the tricky one
                    if (
                        changes.width !== undefined &&
                        changes.height !== undefined
                    ) {
                        // Try different approaches based on node type
                        if (typeof node.setDimensions === "function") {
                            log.debug("Applying size via setDimensions");
                            node.setDimensions(changes.width, changes.height);
                        } else if (typeof node.resize === "function") {
                            log.debug("Applying size via resize");
                            node.resize(changes.width, changes.height);
                        }

                        // Some nodes need their bbox updated directly
                        if (node.bbox) {
                            log.debug("Updating bbox size directly");
                            node.bbox.width = changes.width;
                            node.bbox.height = changes.height;
                        }

                        // Ensure the node's width/height are set directly as well
                        log.debug("Setting width/height directly");
                        node.width = changes.width;
                        node.height = changes.height;
                    }

                    // Try to update the node's visual representation if needed
                    if (typeof node.update === "function") {
                        log.debug("Calling node.update()");
                        node.update();
                    }

                    // The next step is the critical part - ensure the canvas knows about our changes
                    this.ensureCanvasUpdate(canvasView, node);

                    return true;
                } catch (e) {
                    log.error("Error applying changes with direct methods:", e);
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
        log.debug(`Ensuring canvas update for node: ${node.id}`);

        try {
            // First, attempt to update the node in the canvas nodes map
            if (
                canvasView.canvas.nodes &&
                canvasView.canvas.nodes.has(node.id)
            ) {
                log.debug("Node found in canvas nodes map");
            }

            // Essential - save the changes
            log.debug("Requesting canvas save");
            canvasView.canvas.requestSave();

            // Try to trigger visual updates
            if (typeof canvasView.canvas.requestFrame === "function") {
                log.debug("Requesting canvas frame update");
                canvasView.canvas.requestFrame();
            }

            // Create a very small timeout to allow the canvas to process updates
            setTimeout(() => {
                if (typeof canvasView.canvas.requestFrame === "function") {
                    log.debug("Delayed requesting canvas frame update");
                    canvasView.canvas.requestFrame();
                }

                if (typeof canvasView.canvas.render === "function") {
                    log.debug("Delayed requesting canvas render");
                    canvasView.canvas.render();
                }
            }, 50);
        } catch (e) {
            log.error("Error ensuring canvas update:", e);
        }
    }

    copyFormat(canvasView: CanvasView) {
        try {
            log.debug("copyFormat called");

            // Get the selected node
            const selectedElements = Array.from(canvasView.canvas.selection);
            log.debug("Selected elements:", selectedElements);

            if (selectedElements.length === 0) {
                log.debug("No elements selected");
                new Notice("No canvas element selected");
                return;
            }

            // The selection is the actual node object, not just an ID
            const selectedNode = selectedElements[0];
            log.debug(`Selected node type: ${typeof selectedNode}`);

            if (!selectedNode) {
                log.debug("Selected node is null");
                new Notice("No canvas element selected");
                return;
            }

            this.copyFormatFromNode(selectedNode);
        } catch (error) {
            console.error("Error copying format:", error);
            new Notice("Error copying format. Please try again.");
        }
    }

    copyFormatColorOnly(canvasView: CanvasView) {
        try {
            log.debug("copyFormatColorOnly called");

            // Get the selected node
            const selectedElements = Array.from(canvasView.canvas.selection);
            log.debug("Selected elements:", selectedElements);

            if (selectedElements.length === 0) {
                log.debug("No elements selected");
                new Notice("No canvas element selected");
                return;
            }

            // The selection is the actual node object, not just an ID
            const selectedNode = selectedElements[0];
            log.debug(`Selected node type: ${typeof selectedNode}`);

            if (!selectedNode) {
                log.debug("Selected node is null");
                new Notice("No canvas element selected");
                return;
            }

            this.copyFormatColorOnlyFromNode(selectedNode);
        } catch (error) {
            console.error("Error copying color:", error);
            new Notice("Error copying color. Please try again.");
        }
    }

    copyFormatSizeOnly(canvasView: CanvasView) {
        try {
            log.debug("copyFormatSizeOnly called");

            // Get the selected node
            const selectedElements = Array.from(canvasView.canvas.selection);
            log.debug("Selected elements:", selectedElements);

            if (selectedElements.length === 0) {
                log.debug("No elements selected");
                new Notice("No canvas element selected");
                return;
            }

            // The selection is the actual node object, not just an ID
            const selectedNode = selectedElements[0];
            log.debug(`Selected node type: ${typeof selectedNode}`);

            if (!selectedNode) {
                log.debug("Selected node is null");
                new Notice("No canvas element selected");
                return;
            }

            this.copyFormatSizeOnlyFromNode(selectedNode);
        } catch (error) {
            console.error("Error copying size:", error);
            new Notice("Error copying size. Please try again.");
        }
    }

    pasteFormat(canvasView: CanvasView) {
        if (!this.copiedFormat) {
            new Notice("No format copied");
            return;
        }

        try {
            log.debug("pasteFormat called");
            log.debug("Canvas object:", Object.keys(canvasView.canvas));

            // Get all selected nodes
            const selectedElements = Array.from(canvasView.canvas.selection);
            log.debug("Selected elements for paste:", selectedElements);

            if (selectedElements.length === 0) {
                log.debug("No elements selected for paste");
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

            log.debug(`Modified node count: ${modifiedCount}`);

            if (modifiedCount > 0) {
                // Show a notice
                new Notice(
                    `Format applied to ${modifiedCount} canvas element${modifiedCount > 1 ? "s" : ""}`,
                );

                // Request save one more time at the end
                log.debug("Final requestSave() call");
                canvasView.canvas.requestSave();

                // Do one final delayed update
                setTimeout(() => {
                    if (typeof canvasView.canvas.requestFrame === "function") {
                        log.debug("Final delayed frame update");
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
            log.debug("getNodeData called with node:", !!node);

            // Check if node is null or undefined
            if (!node) {
                log.debug("Node is null or undefined");
                return null;
            }

            // Log node structure for debugging
            log.debug("Node structure:", Object.keys(node));

            // Approach 1: Check if node is already a data object (has x, y, width, height)
            if (
                typeof node.x === "number" &&
                typeof node.y === "number" &&
                typeof node.width === "number" &&
                typeof node.height === "number"
            ) {
                log.debug("Node appears to be a direct data object");
                return node;
            }

            // Approach 2: Check if node has a data property
            if (node.data && typeof node.data === "object") {
                log.debug("Node has a data property");
                return node.data;
            }

            // Approach 3: Check if node has a getData method
            if (typeof node.getData === "function") {
                log.debug("Node has a getData method");
                const data = node.getData();
                if (data) return data;
            }

            // Approach 4: For some node types, x, y, width, height might be direct properties
            // but not in a data object
            if (node.width !== undefined && node.height !== undefined) {
                log.debug("Node has width/height as direct properties");
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
                log.debug("Node has a bbox property");
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

            log.debug("Failed to get node data from node");
            return null;
        } catch (error) {
            log.error("Error in getNodeData:", error);
            return null;
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

    updateLoggerDebugMode() {
        // Update logger debug mode based on current settings
        log.setDebugMode(this.settings.debugMode);
        log.info(
            `Debug mode ${this.settings.debugMode ? "enabled" : "disabled"}`,
        );
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
            this.statusBarItem.addClass("status-bar-hidden");
            this.statusBarItem.removeClass("status-bar-visible");
            return;
        }

        this.statusBarItem.addClass("status-bar-visible");
        this.statusBarItem.removeClass("status-bar-hidden");
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
                colorPreview.style.setProperty(
                    "--color-preview-background",
                    this.copiedFormat.color,
                );
                colorPreview.addClass(
                    "canvas-format-brush-color-preview-dynamic",
                );
            }
        } else {
            textEl.setText("No format copied");
        }
    }

    // Helper to create a button for the popup menu
    createPopupButton(
        title: string,
        icon: string,
        clickHandler: (e: MouseEvent) => void,
    ): HTMLElement {
        const button = document.createElement("button");
        button.addClass("clickable-icon");
        button.setAttribute("aria-label", title);
        setIcon(button, icon);
        setTooltip(button, title);
        button.addEventListener("click", (e: MouseEvent) => {
            e.stopPropagation(); // Prevent the event from closing the popup
            clickHandler(e);
        });

        return button;
    }

    // Show a submenu with format brush options
    showFormatBrushSubmenu(event: MouseEvent, canvasView: CanvasView) {
        // Create a custom menu element
        const customMenu = document.createElement("div");
        customMenu.addClass("format-brush-custom-menu");

        // Only show copy options if one node is selected
        const hasSingleSelection = canvasView.canvas.selection.size === 1;

        if (hasSingleSelection) {
            // Copy all format option
            const copyAllButton = this.createCustomMenuItem(
                "Copy format",
                "clipboard-copy",
                "copy-all-item",
                () => this.copyFormat(canvasView),
            );
            customMenu.appendChild(copyAllButton);

            // Copy size only option
            const copySizeButton = this.createCustomMenuItem(
                "Copy size",
                "maximize-2",
                "copy-size-item",
                () => this.copyFormatSizeOnly(canvasView),
            );
            customMenu.appendChild(copySizeButton);

            // Copy color only option
            const copyColorButton = this.createCustomMenuItem(
                "Copy color",
                "palette",
                "copy-color-item",
                () => this.copyFormatColorOnly(canvasView),
            );
            customMenu.appendChild(copyColorButton);
        }

        // Add paste button if we have a copied format
        if (this.copiedFormat) {
            // Add a separator if we also have copy options
            if (hasSingleSelection) {
                const separator = document.createElement("div");
                separator.addClass("format-brush-menu-separator");
                customMenu.appendChild(separator);
            }

            const pasteButton = this.createCustomMenuItem(
                "Paste format",
                "clipboard-paste",
                "paste-item",
                () => this.pasteFormat(canvasView),
            );
            customMenu.appendChild(pasteButton);
        }

        // Position the menu
        document.body.appendChild(customMenu);
        const menuRect = customMenu.getBoundingClientRect();

        // Adjust position to keep menu in viewport
        let xPos = event.clientX;
        let yPos = event.clientY;

        if (xPos + menuRect.width > window.innerWidth) {
            xPos = window.innerWidth - menuRect.width - 10;
        }

        if (yPos + menuRect.height > window.innerHeight) {
            yPos = window.innerHeight - menuRect.height - 10;
        }

        customMenu.style.setProperty("--menu-left-position", `${xPos}px`);
        customMenu.style.setProperty("--menu-top-position", `${yPos}px`);

        // Click outside to close
        const closeOnClickOutside = (e: MouseEvent) => {
            if (!customMenu.contains(e.target as Node)) {
                customMenu.remove();
                document.removeEventListener("click", closeOnClickOutside);
            }
        };

        // Wait a moment before adding click listener to prevent immediate closing
        setTimeout(() => {
            document.addEventListener("click", closeOnClickOutside);
        }, 10);
    }

    // Helper method to create a custom menu item with icon
    createCustomMenuItem(
        title: string,
        iconId: string,
        className: string,
        clickHandler: () => void,
    ): HTMLElement {
        const menuItem = document.createElement("div");
        menuItem.addClass("format-brush-custom-menu-item", className);

        // Create icon container
        const iconContainer = document.createElement("div");
        iconContainer.addClass("format-brush-custom-icon");
        setIcon(iconContainer, iconId);
        menuItem.appendChild(iconContainer);

        // Create label
        const label = document.createElement("div");
        label.addClass("format-brush-custom-label");
        label.setText(title);
        menuItem.appendChild(label);

        // Add click handler
        menuItem.addEventListener("click", (e) => {
            e.stopPropagation();
            clickHandler();

            // Remove the menu after selection
            const menu = menuItem.parentElement;
            if (menu) {
                menu.remove();
                // We can't access the specific listener, so we just remove the menu
            }
        });

        return menuItem;
    }
}
