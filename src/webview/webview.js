// This script runs in the webview context
(function() {
    // Get a reference to the VS Code API
    const vscode = acquireVsCodeApi();

    // Event listener for sorting headers
    document.querySelectorAll('th[id^="sort-"]').forEach(header => {
        header.addEventListener('click', () => {
            const sortBy = header.id.replace('sort-', '');
            // Post a message to the extension to request sorting
            vscode.postMessage({
                command: 'sort',
                by: sortBy
            });
        });
    });

    // Event listener for search input
    const searchInput = document.getElementById('search-input'); // Changed ID to match HTML
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('keyup', (event) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                // Post a message to the extension with the search query
                vscode.postMessage({
                    command: 'search',
                    value: event.target.value
                });
            }, 300); // Debounce search input
        });
    }

    // Event listener for "Go Up" button
    const goUpButton = document.getElementById('goUp');
    if (goUpButton) {
        goUpButton.addEventListener('click', () => {
            // Post a message to the extension to navigate up
            vscode.postMessage({
                command: 'goUp'
            });
        });
    }

    // Event listener for clicking on file/folder rows
    document.querySelectorAll('tr.row').forEach(row => {
        row.addEventListener('click', () => {
            const path = row.dataset.path; // Get the full path from data-path attribute
            const isFolder = row.classList.contains('folder-row'); // Check if it's a folder

            if (isFolder) {
                // If it's a folder, send 'openFolder' command
                vscode.postMessage({
                    command: 'openFolder',
                    path: path
                });
            } else {
                // If it's a file, send 'openFile' command
                vscode.postMessage({
                    command: 'openFile',
                    path: path
                });
            }
        });
    });
}());
