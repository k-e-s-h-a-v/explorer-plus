// src/FileExplorerView.js
const vscode = require('vscode');
const path = require('path');
const { getFolderSizeSync, formatSize, formatDate } = require('./utils/fileUtils'); // Path updated

class FileExplorerViewProvider {
    constructor(context) {
        this.context = context;
        this.sortBy = 'name';
        this.sortDir = 1; // 1: asc, -1: desc
        this.search = '';
        this.root = undefined; // Current directory being displayed
    }

    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this._render();

        webviewView.webview.onDidReceiveMessage(msg => {
            switch (msg.command) {
                case 'sort':
                    if (this.sortBy === msg.by) {
                        this.sortDir *= -1;
                    } else {
                        this.sortBy = msg.by;
                        this.sortDir = 1;
                    }
                    this._render();
                    break;
                case 'search':
                    this.search = msg.value || '';
                    this._render();
                    break;
                case 'openFolder':
                    this.root = msg.path;
                    this._render();
                    break;
                case 'goUp':
                    if (this.root) {
                        const newRoot = path.dirname(this.root);
                        // Prevent going above the workspace root (if applicable)
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders && workspaceFolders.length > 0) {
                            const workspaceRoot = workspaceFolders[0].uri.fsPath;
                            // Ensure we don't navigate above the initial workspace root,
                            // unless the current root itself is the filesystem root.
                            // Handle cases for Windows drives (e.g., C:\) and Unix roots (e.g., /)
                            const isFilesystemRoot = (newRoot === this.root) || (path.dirname(newRoot) === newRoot);

                            if (newRoot.startsWith(workspaceRoot) || isFilesystemRoot) {
                                this.root = newRoot;
                                this._render();
                            }
                        }
                    }
                    break;
            }
        });
    }

    _render() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.webviewView.webview.html = '<div style="padding:1em;">No workspace folder open</div>';
            return;
        }

        const rootPath = this.root || workspaceFolders[0].uri.fsPath;
        let entries = [];
        try {
            const fs = require('fs');
            entries = fs.readdirSync(rootPath, { withFileTypes: true })
                .filter(e => !e.name.startsWith('.'))
                .map(e => {
                    const fullPath = path.join(rootPath, e.name);
                    let stat;
                    try {
                        stat = fs.statSync(fullPath);
                    } catch {
                        stat = {};
                    }
                    let size = 0;
                    if (e.isDirectory()) {
                        size = getFolderSizeSync(fullPath); // Use utility function
                    } else if (e.isFile()) {
                        size = stat.size || 0;
                    }
                    return {
                        name: e.name,
                        isDir: e.isDirectory(),
                        size,
                        ctime: stat.ctime ? stat.ctime.getTime() : 0,
                        mtime: stat.mtime ? stat.mtime.getTime() : 0,
                        path: fullPath
                    };
                });
        } catch (error) {
            this.webviewView.webview.html = `<div style="padding:1em;">Unable to read directory: ${error.message}</div>`;
            return;
        }

        // Filter by search
        let filtered = entries;
        if (this.search) {
            const q = this.search.toLowerCase();
            filtered = entries.filter(e => e.name.toLowerCase().includes(q));
        }

        // Sort
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
            // Folders always come before files
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return cmp * this.sortDir;
        });

        // HTML for rows
        const rows = filtered.map(e => `
            <tr data-path="${e.path}" class="row" style="cursor:pointer;">
                <td style="width:28px;text-align:center;">
                    <span class="mdi ${e.isDir ? 'mdi-folder' : 'mdi-file-outline'}"></span>
                </td>
                <td>${e.name}</td>
                <td style="text-align:right;">${e.size ? formatSize(e.size) : '-'}</td>
                <td>${e.ctime ? formatDate(e.ctime) : ''}</td>
                <td>${e.mtime ? formatDate(e.mtime) : ''}</td>
            </tr>
        `).join('');

        // Up button if not at workspace root or filesystem root
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        // Check if current path is different from workspace root and not a filesystem root itself
        const showUp = this.root && this.root !== workspaceRoot && path.dirname(this.root) !== this.root;


        this.webviewView.webview.html = this._getWebviewContent(rootPath, showUp, rows);
    }

    _getWebviewContent(rootPath, showUp, rows) {
        // Local path to the webview JavaScript file (path updated)
        const scriptUri = this.webviewView.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webview', 'webview.js'));

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>File Explorer</title>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css">
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                        color: var(--vscode-editorWidget-foreground);
                        font-size: 13px;
                        background-color: var(--vscode-editorGroup-background);
                    }
                    #search {
                        flex: 1;
                        padding: 4px 8px;
                        border-radius: 4px;
                        border: 1px solid var(--vscode-input-border);
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        font-size: 13px;
                    }
                    #goUp {
                        margin-left: 8px;
                        border: none;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border-radius: 4px;
                        padding: 2px 10px;
                        cursor: pointer;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 8px;
                    }
                    th, td {
                        padding: 6px;
                        text-align: left;
                        border-bottom: 1px solid var(--vscode-list-hoverBackground);
                    }
                    th {
                        background: var(--vscode-editorWidget-background);
                        cursor: pointer;
                        font-weight: normal;
                    }
                    tr.row:hover {
                        background-color: var(--vscode-list-hoverBackground);
                    }
                    .mdi {
                        vertical-align: middle;
                        font-size: 16px;
                    }
                    .current-path {
                        font-size: 12px;
                        color: var(--vscode-descriptionForeground);
                        margin-bottom: 4px;
                        word-break: break-all;
                    }
                </style>
            </head>
            <body>
                <div style="padding:0.5em;">
                    <div style="display:flex;align-items:center;margin-bottom:8px;">
                        <input id="search" type="text" placeholder="Search files..." value="${this.search || ''}">
                        ${showUp ? `<button id="goUp" title="Up">&#8593;</button>` : ''}
                    </div>
                    <div class="current-path">${rootPath}</div>
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