const vscode = require('vscode');
const path = require('path');
const { getFolderSizeSync, formatSize, formatDate, formatDateCompact, formatDateRelative } = require('./utils/fileUtils');

// Get column visibility settings
function getColumnSettings() {
    const config = vscode.workspace.getConfiguration('explorerPlus');
    return {
        showSize: config.get('showSize', true),
        showDateCreated: config.get('showDateCreated', true),
        showDateModified: config.get('showDateModified', true)
    };
}

class FileExplorerViewProvider {
    /**
     * @param {vscode.ExtensionContext} context The extension context.
     */
    constructor(context) {
        this.context = context;
        this.sortBy = 'name'; // Current sort column
        this.sortDir = 1; // 1: ascending, -1: descending
        this.search = ''; // Current search query
        this.root = undefined; // Current directory being displayed in the webview

        // Initialize the root to the first workspace folder if available
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.root = workspaceFolders[0].uri.fsPath;
        }

        // Initialize context keys for view/title commands
        this._updateContextKeys();
    }

    /**
     * Update VS Code context keys based on current settings.
     * @private
     */
    _updateContextKeys() {
        const config = vscode.workspace.getConfiguration('explorerPlus');
        vscode.commands.executeCommand('setContext', 'explorerPlus.showSize', config.get('showSize', true));
        vscode.commands.executeCommand('setContext', 'explorerPlus.showDateCreated', config.get('showDateCreated', true));
        vscode.commands.executeCommand('setContext', 'explorerPlus.showDateModified', config.get('showDateModified', true));
        vscode.commands.executeCommand('setContext', 'explorerPlus.dateFormat', config.get('dateFormat', 'full'));
    }

    /**
     * Set a column's visibility.
     * @param {string} key The configuration key (e.g. 'showSize').
     * @param {boolean} visible Whether the column should be visible.
     * @private
     */
    _setColumnVisibility(key, visible) {
        const config = vscode.workspace.getConfiguration('explorerPlus');
        config.update(key, visible, vscode.ConfigurationTarget.Global);
        this._updateContextKeys();
        this._render();
    }

    /**
     * Cycle the date format: full → compact → relative → full.
     * @private
     */
    _cycleDateFormat() {
        const config = vscode.workspace.getConfiguration('explorerPlus');
        const order = ['full', 'compact', 'relative'];
        const current = config.get('dateFormat', 'full');
        const nextIndex = (order.indexOf(current) + 1) % order.length;
        config.update('dateFormat', order[nextIndex], vscode.ConfigurationTarget.Global);
        this._updateContextKeys();
        this._render();
    }

    /**
     * Set a specific date format.
     * @param {string} format The format to set ('full', 'compact', or 'relative').
     * @private
     */
    _setDateFormat(format) {
        const config = vscode.workspace.getConfiguration('explorerPlus');
        config.update('dateFormat', format, vscode.ConfigurationTarget.Global);
        this._updateContextKeys();
        this._render();
    }

    /**
     * @param {vscode.WebviewView} webviewView The webview view instance.
     * @param {vscode.WebviewViewResolveContext} context The resolve context.
     * @param {vscode.CancellationToken} token The cancellation token.
     */
    resolveWebviewView(webviewView, context, token) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            // Allow access to resources in the extension's src/webview directory
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview'),
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'utils')
            ]
        };
        this._render(); // Initial render of the webview

        // Register toggle commands
        this.context.subscriptions.push(
            vscode.commands.registerCommand('explorerPlus.hideSize', () => this._setColumnVisibility('showSize', false)),
            vscode.commands.registerCommand('explorerPlus.showSize', () => this._setColumnVisibility('showSize', true)),
            vscode.commands.registerCommand('explorerPlus.hideDateCreated', () => this._setColumnVisibility('showDateCreated', false)),
            vscode.commands.registerCommand('explorerPlus.showDateCreated', () => this._setColumnVisibility('showDateCreated', true)),
            vscode.commands.registerCommand('explorerPlus.hideDateModified', () => this._setColumnVisibility('showDateModified', false)),
            vscode.commands.registerCommand('explorerPlus.showDateModified', () => this._setColumnVisibility('showDateModified', true)),
            vscode.commands.registerCommand('explorerPlus.dateFormatFullActive', () => {}),
            vscode.commands.registerCommand('explorerPlus.dateFormatFull', () => this._setDateFormat('full')),
            vscode.commands.registerCommand('explorerPlus.dateFormatCompactActive', () => {}),
            vscode.commands.registerCommand('explorerPlus.dateFormatCompact', () => this._setDateFormat('compact')),
            vscode.commands.registerCommand('explorerPlus.dateFormatRelativeActive', () => {}),
            vscode.commands.registerCommand('explorerPlus.dateFormatRelative', () => this._setDateFormat('relative'))
        );

        // Listen for configuration changes
        this.context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('explorerPlus')) {
                    this._updateContextKeys();
                    this._render();
                }
            })
        );

        // Handle messages received from the webview
        webviewView.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'sort':
                    // Toggle sort direction if the same column is clicked, otherwise reset to ascending
                    if (this.sortBy === msg.by) {
                        this.sortDir *= -1;
                    } else {
                        this.sortBy = msg.by;
                        this.sortDir = 1;
                    }
                    this._render();
                    break;
                case 'search':
                    // Update search query and re-render
                    this.search = msg.value || '';
                    this._render();
                    break;
                case 'openFolder':
                    // Set new root path and re-render
                    this.root = msg.path;
                    this._render();
                    break;
                case 'openFile':
                    // Open the file in VS Code editor
                    try {
                        const document = await vscode.workspace.openTextDocument(msg.path);
                        await vscode.window.showTextDocument(document);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Could not open file: ${error.message}`);
                    }
                    break;
                case 'openFileTab':
                    // Open the file in a new tab in the current editor group (middle-click behavior)
                    try {
                        const document = await vscode.workspace.openTextDocument(msg.path);
                        await vscode.window.showTextDocument(document, { preview: false });
                    } catch (error) {
                        vscode.window.showErrorMessage(`Could not open file: ${error.message}`);
                    }
                    break;
                case 'goUp':
                    // Navigate up to the parent directory
                    if (this.root) {
                        const newRoot = path.dirname(this.root);
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        let workspaceRoot = '';
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            workspaceRoot = workspaceFolders[0].uri.fsPath;
                        }

                        // Prevent going above the workspace root unless the current root is the filesystem root
                        // This handles both Windows (C:\) and Unix (/) root paths
                        const isFilesystemRoot = (newRoot === this.root) || (path.dirname(newRoot) === newRoot);

                        if (isFilesystemRoot || (workspaceRoot && newRoot.startsWith(workspaceRoot))) {
                            this.root = newRoot;
                            this._render();
                        } else if (!workspaceRoot) { // If no workspace is open, allow going up to filesystem root
                            this.root = newRoot;
                            this._render();
                        }
                    }
                    break;
            }
        });
    }

    /**
     * Renders the webview content based on the current state (root, sort, search).
     * @private
     */
    _render() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.webviewView.webview.html = '<div style="padding:1em; color: var(--vscode-foreground);">No workspace folder open.</div>';
            return;
        }

        // Get column visibility settings
        const columns = getColumnSettings();

        // Get date format setting
        const config = vscode.workspace.getConfiguration('explorerPlus');
        const dateFormat = config.get('dateFormat', 'full');
        const dateFormatter = dateFormat === 'compact' ? formatDateCompact
                           : dateFormat === 'relative' ? formatDateRelative
                           : formatDate;

        const rootPath = this.root || workspaceFolders[0].uri.fsPath;
        let entries = [];
        try {
            const fs = require('fs'); // Node.js 'fs' module is available in VS Code extensions
            entries = fs.readdirSync(rootPath, { withFileTypes: true })
                .filter(e => !e.name.startsWith('.')) // Filter out hidden files/folders
                .map(e => {
                    const fullPath = path.join(rootPath, e.name);
                    let stat;
                    try {
                        stat = fs.statSync(fullPath);
                    } catch (err) {
                        // Handle permission errors or deleted files gracefully
                        console.error(`Error getting stats for ${fullPath}: ${err.message}`);
                        stat = {}; // Default to empty stat if error occurs
                    }

                    let size = 0;
                    if (e.isDirectory()) {
                        // Calculate folder size using the utility function
                        size = getFolderSizeSync(fullPath);
                    } else if (e.isFile()) {
                        size = stat.size || 0;
                    }
                    return {
                        name: e.name,
                        isDir: e.isDirectory(),
                        size,
                        ctime: stat.ctime ? stat.ctime.getTime() : 0, // Creation time in milliseconds
                        mtime: stat.mtime ? stat.mtime.getTime() : 0, // Modification time in milliseconds
                        path: fullPath
                    };
                });
        } catch (error) {
            this.webviewView.webview.html = `<div style="padding:1em; color: var(--vscode-errorForeground);">Unable to read directory: ${error.message}</div>`;
            return;
        }

        // Filter entries based on the search query
        let filtered = entries;
        if (this.search) {
            const q = this.search.toLowerCase();
            filtered = entries.filter(e => e.name.toLowerCase().includes(q));
        }

        // Sort entries
        filtered.sort((a, b) => {
            let cmp = 0;
            if (this.sortBy === 'name') {
                cmp = a.name.localeCompare(b.name);
            } else if (this.sortBy === 'size') {
                cmp = (a.size || 0) - (b.size || 0);
            } else if (this.sortBy === 'ctime') {
                cmp = (a.ctime || 0) - (b.ctime || 0);
            } else if (this.sortBy === 'mtime') {
                cmp = (a.mtime || 0) - (b.mtime || 0);
            }
            // Folders always come before files, regardless of other sorting criteria
            if (a.isDir !== b.isDir) {
                return a.isDir ? -1 : 1;
            }
            return cmp * this.sortDir; // Apply sort direction
        });

        // Generate HTML for table rows
        const rowsHtml = filtered.map(e => `
            <tr data-path="${e.path}" class="row ${e.isDir ? 'folder-row' : 'file-row'}" style="cursor:pointer;">
                <td style="width:28px;text-align:center;">
                    <span class="mdi ${e.isDir ? 'mdi-folder' : 'mdi-file-outline'}"></span>
                </td>
                <td>${e.name}</td>
                ${columns.showSize ? `<td style="text-align:right;">${e.size ? formatSize(e.size) : '-'}</td>` : ''}
                ${columns.showDateCreated ? `<td>${e.ctime ? dateFormatter(e.ctime) : ''}</td>` : ''}
                ${columns.showDateModified ? `<td>${e.mtime ? dateFormatter(e.mtime) : ''}</td>` : ''}
            </tr>
        `).join('');

        // Determine if the "Up" button should be shown
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        // Check if current path is different from workspace root and not a filesystem root itself
        const showUp = this.root && this.root !== workspaceRoot && path.dirname(this.root) !== this.root;

        this.webviewView.webview.html = this._getWebviewContent(rootPath, showUp, rowsHtml, columns);
    }

    /**
     * Generates the full HTML content for the webview.
     * @param {string} rootPath The current directory path being displayed.
     * @param {boolean} showUp Whether to show the "Up" button.
     * @param {string} rowsHtml The HTML string for the table rows.
     * @param {object} columns Column visibility settings.
     * @returns {string} The complete HTML content.
     * @private
     */
    _getWebviewContent(rootPath, showUp, rowsHtml, columns) {
        // Get URIs for webview resources
        const scriptUri = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'webview.js'));
        const styleUri = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'webview.css'));

        // Count visible columns for colspan
        let colCount = 2; // icon + name
        if (columns.showSize) colCount++;
        if (columns.showDateCreated) colCount++;
        if (columns.showDateModified) colCount++;

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>File Explorer</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css">
                <link rel="stylesheet" href="${styleUri}">
                <style>
                    body { overflow-x: hidden; }
                    table { table-layout: fixed; width: 100%; border-collapse: collapse; }
                    th { overflow: visible; }
                    td { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                    th.resizable { position: relative; }
                    .resize-handle {
                        position: absolute;
                        right: 0;
                        top: 0;
                        bottom: 0;
                        width: 1px;
                        background: var(--vscode-panel-border, #888);
                        cursor: col-resize;
                        z-index: 1;
                    }
                    .resize-handle:hover,
                    .resize-handle.active {
                        width: 4px;
                        margin-left: -1.5px;
                        background: var(--vscode-sash-hoverBorder, #007fd4);
                    }
                    body.resizing { cursor: col-resize !important; user-select: none; }
                    body.resizing table { pointer-events: none; }
                    th.resizable:hover { background-color: var(--vscode-list-hoverBackground); }
                </style>
            </head>
            <body>
                <div style="padding:0.5em;">
                    <div style="display:flex;align-items:center;margin-bottom:8px;">
                        <div class="current-path" title="${rootPath}">${rootPath}</div>
                        ${showUp ? `<button id="goUp" title="Go Up Directory">&#8593;</button>` : ''}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th style="width:28px;"></th>
                                <th class="resizable" data-column="name" id="sort-name">Name ${this.sortBy === 'name' ? (this.sortDir === 1 ? '▲' : '▼') : ''}<div class="resize-handle"></div></th>
                                ${columns.showSize ? `<th class="resizable" data-column="size" style="text-align:right;" id="sort-size">Size ${this.sortBy === 'size' ? (this.sortDir === 1 ? '▲' : '▼') : ''}<div class="resize-handle"></div></th>` : ''}
                                ${columns.showDateCreated ? `<th class="resizable" data-column="ctime" id="sort-ctime">Created ${this.sortBy === 'ctime' ? (this.sortDir === 1 ? '▲' : '▼') : ''}<div class="resize-handle"></div></th>` : ''}
                                ${columns.showDateModified ? `<th class="resizable" data-column="mtime" id="sort-mtime">Modified ${this.sortBy === 'mtime' ? (this.sortDir === 1 ? '▲' : '▼') : ''}<div class="resize-handle"></div></th>` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml || `<tr><td colspan="${colCount}" style="color:var(--vscode-descriptionForeground);text-align:center;">No files/folders</td></tr>`}
                        </tbody>
                    </table>
                </div>
                <script src="${scriptUri}"></script>
            </body>
            </html>
        `;
    }
}

module.exports = { FileExplorerViewProvider };
