const vscode = require('vscode');
const path = require('path');
const { getFolderSizeSync, formatSize, formatDate } = require('./utils/fileUtils'); // Path updated

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
        const rows = filtered.map(e => `
            <tr data-path="${e.path}" class="row ${e.isDir ? 'folder-row' : 'file-row'}" style="cursor:pointer;">
                <td style="width:28px;text-align:center;">
                    <span class="mdi ${e.isDir ? 'mdi-folder' : 'mdi-file-outline'}"></span>
                </td>
                <td>${e.name}</td>
                <td style="text-align:right;">${e.size ? formatSize(e.size) : '-'}</td>
                <td>${e.ctime ? formatDate(e.ctime) : ''}</td>
                <td>${e.mtime ? formatDate(e.mtime) : ''}</td>
            </tr>
        `).join('');

        // Determine if the "Up" button should be shown
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        // Check if current path is different from workspace root and not a filesystem root itself
        const showUp = this.root && this.root !== workspaceRoot && path.dirname(this.root) !== this.root;

        this.webviewView.webview.html = this._getWebviewContent(rootPath, showUp, rows);
    }

    /**
     * Generates the full HTML content for the webview.
     * @param {string} rootPath The current directory path being displayed.
     * @param {boolean} showUp Whether to show the "Up" button.
     * @param {string} rows The HTML string for the table rows.
     * @returns {string} The complete HTML content.
     * @private
     */
    _getWebviewContent(rootPath, showUp, rows) {
        // Get URIs for webview resources
        const scriptUri = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'webview.js'));
        const styleUri = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'webview.css'));

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
                    /* Basic styling for VS Code theme integration */

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
                                <th></th>
                                <th id="sort-name">Name ${this.sortBy === 'name' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                                <th style="text-align:right;" id="sort-size">Size ${this.sortBy === 'size' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                                <th id="sort-ctime">Created ${this.sortBy === 'ctime' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                                <th id="sort-mtime">Modified ${this.sortBy === 'mtime' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || `<tr><td colspan="5" style="color:var(--vscode-descriptionForeground);text-align:center;">No files/folders</td></tr>`}
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