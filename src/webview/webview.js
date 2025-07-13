// src/webview/webview.js
(function() {
    const vscode = acquireVsCodeApi();

    // Event listener for search input
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.oninput = function(e) {
            vscode.postMessage({ command: 'search', value: e.target.value });
        };
    }

    // Event listeners for sort headers
    const sortByName = document.getElementById('sort-name');
    if (sortByName) {
        sortByName.onclick = function() {
            vscode.postMessage({ command: 'sort', by: 'name' });
        };
    }

    const sortBySize = document.getElementById('sort-size');
    if (sortBySize) {
        sortBySize.onclick = function() {
            vscode.postMessage({ command: 'sort', by: 'size' });
        };
    }

    const sortByCtime = document.getElementById('sort-ctime');
    if (sortByCtime) {
        sortByCtime.onclick = function() {
            vscode.postMessage({ command: 'sort', by: 'ctime' });
        };
    }

    const sortByMtime = document.getElementById('sort-mtime');
    if (sortByMtime) {
        sortByMtime.onclick = function() {
            vscode.postMessage({ command: 'sort', by: 'mtime' });
        };
    }

    // Event listeners for rows (folder clicks)
    Array.from(document.querySelectorAll('tr.row')).forEach(row => {
        row.onclick = function(e) {
            const path = row.getAttribute('data-path');
            // Check if it's a folder icon and not clicking on a button inside the row (though there are none currently)
            if (row.querySelector('.mdi-folder') && e.target.tagName !== 'BUTTON') {
                vscode.postMessage({ command: 'openFolder', path });
            }
            // Add logic here to open files in VS Code if needed, e.g.,
            // else if (row.querySelector('.mdi-file-outline')) {
            //     vscode.postMessage({ command: 'openFile', path });
            // }
        };
    });

    // Event listener for "Go Up" button
    const upBtn = document.getElementById('goUp');
    if (upBtn) {
        upBtn.onclick = function() {
            vscode.postMessage({ command: 'goUp' });
        };
    }
})();