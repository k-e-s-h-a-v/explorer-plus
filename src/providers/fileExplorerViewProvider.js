const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function getFolderSizeSync(dir) {
    let total = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const fullPath = path.join(dir, entry.name);
            try {
                if (entry.isDirectory()) {
                    total += getFolderSizeSync(fullPath);
                } else if (entry.isFile()) {
                    total += fs.statSync(fullPath).size || 0;
                }
            } catch {}
        }
    } catch {}
    return total;
}

class FileExplorerViewProvider {
    constructor(context) {
        this.context = context;
        this.sortBy = 'name';
        this.sortDir = 1; // 1: asc, -1: desc
        this.search = '';
    }

    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = { enableScripts: true };
        this._render();

        webviewView.webview.onDidReceiveMessage(msg => {
            if (msg.command === 'sort') {
                if (this.sortBy === msg.by) {
                    this.sortDir *= -1;
                } else {
                    this.sortBy = msg.by;
                    this.sortDir = 1;
                }
                this._render();
            } else if (msg.command === 'search') {
                this.search = msg.value || '';
                this._render();
            } else if (msg.command === 'openFolder') {
                this.root = msg.path;
                this._render();
            } else if (msg.command === 'goUp') {
                if (this.root) {
                    this.root = path.dirname(this.root);
                    this._render();
                }
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
                        // Caution: This can be slow for large folders!
                        size = getFolderSizeSync(fullPath);
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
        } catch {
            this.webviewView.webview.html = '<div style="padding:1em;">Unable to read directory</div>';
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
                <td style="text-align:right;">${e.size ? this._formatSize(e.size) : '-'}</td>
                <td>${e.ctime ? this._formatDate(e.ctime) : ''}</td>
                <td>${e.mtime ? this._formatDate(e.mtime) : ''}</td>
            </tr>
        `).join('');

        // Up button if not at workspace root
        const showUp = this.root && path.dirname(this.root) !== this.root;

        this.webviewView.webview.html = `
            <div style="padding:0.5em 0.5em 0 0.5em; color: var(--vscode-editorWidget-foreground); font-size:13px;">
                <div style="display:flex;align-items:center;margin-bottom:8px;">
                    <input id="search" type="text" placeholder="Search files..." value="${this.search || ''}" style="flex:1;padding:4px 8px;border-radius:4px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background);color:var(--vscode-input-foreground);font-size:13px;">
                    ${showUp ? `<button id="goUp" title="Up" style="margin-left:8px;border:none;background:var(--vscode-button-background);color:var(--vscode-button-foreground);border-radius:4px;padding:2px 10px;cursor:pointer;">&#8593;</button>` : ''}
                </div>
                <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:4px;word-break:break-all;">${rootPath}</div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--vscode-editorWidget-background);">
                            <th></th>
                            <th style="cursor:pointer;" id="sort-name">Name ${this.sortBy === 'name' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                            <th style="cursor:pointer;text-align:right;" id="sort-size">Size ${this.sortBy === 'size' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                            <th style="cursor:pointer;" id="sort-ctime">Created ${this.sortBy === 'ctime' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                            <th style="cursor:pointer;" id="sort-mtime">Modified ${this.sortBy === 'mtime' ? (this.sortDir === 1 ? '▲' : '▼') : ''}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || `<tr><td colspan="5" style="color:var(--vscode-descriptionForeground);text-align:center;">No files/folders</td></tr>`}
                    </tbody>
                </table>
            </div>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css">
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    document.getElementById('search').oninput = function(e) {
                        vscode.postMessage({command:'search', value: e.target.value});
                    };
                    document.getElementById('sort-name').onclick = function() {
                        vscode.postMessage({command:'sort', by:'name'});
                    };
                    document.getElementById('sort-size').onclick = function() {
                        vscode.postMessage({command:'sort', by:'size'});
                    };
                    document.getElementById('sort-ctime').onclick = function() {
                        vscode.postMessage({command:'sort', by:'ctime'});
                    };
                    document.getElementById('sort-mtime').onclick = function() {
                        vscode.postMessage({command:'sort', by:'mtime'});
                    };
                    Array.from(document.querySelectorAll('tr.row')).forEach(row => {
                        row.onclick = function(e) {
                            const path = row.getAttribute('data-path');
                            if (row.querySelector('.mdi-folder') && e.target.tagName !== 'BUTTON') {
                                vscode.postMessage({command:'openFolder', path});
                            }
                        };
                    });
                    const upBtn = document.getElementById('goUp');
                    if (upBtn) {
                        upBtn.onclick = function() {
                            vscode.postMessage({command:'goUp'});
                        };
                    }
                })();
            </script>
        `;
    }

    _formatSize(size) {
        if (!size) return '-';
        if (size < 1024) return size + ' B';
        if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
        if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB';
        return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    _formatDate(ts) {
        const d = new Date(ts);
        return d.toLocaleString();
    }
}

module.exports = { FileExplorerViewProvider };
