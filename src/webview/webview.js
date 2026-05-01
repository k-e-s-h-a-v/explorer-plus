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
        // Use mousedown to detect which mouse button was pressed
        row.addEventListener('mousedown', (e) => {
            const path = row.dataset.path; // Get the full path from data-path attribute
            const isFolder = row.classList.contains('folder-row'); // Check if it's a folder

            // Middle mouse button (button === 1)
            if (e.button === 1) {
                e.preventDefault(); // Prevent auto-scroll behavior
                if (!isFolder) {
                    // Open file in a new tab in the current editor group
                    vscode.postMessage({
                        command: 'openFileTab',
                        path: path
                    });
                }
                return;
            }

            // Left mouse button (button === 0) - existing behavior
            if (e.button === 0) {
                if (isFolder) {
                    vscode.postMessage({
                        command: 'openFolder',
                        path: path
                    });
                } else {
                    vscode.postMessage({
                        command: 'openFile',
                        path: path
                    });
                }
            }
        });
    });

    // Initialize column resize handles
    (function initColumnResize() {
        // Apply saved column widths immediately to prevent layout shift
        try {
            var saved = JSON.parse(localStorage.getItem('explorer-plus-column-widths') || '{}');
            var table = document.querySelector('table');
            var totalSaved = 0;
            var visibleCols = document.querySelectorAll('th[data-column]');
            
            Object.keys(saved).forEach(function(col) { totalSaved += saved[col]; });
            
            // Only apply if saved widths fit within current viewport (with 10px buffer)
            if (totalSaved > 0 && totalSaved <= table.offsetWidth + 10) {
                visibleCols.forEach(function(th) {
                    var col = th.dataset.column;
                    if (saved[col]) th.style.width = saved[col] + 'px';
                });
            }
        } catch(e) {}

        var isResizing = false;
        var startTh = null;
        var nextTh = null;
        var startX = 0;
        var startWidth = 0;
        var nextStartWidth = 0;

        function onMouseMove(e) {
            if (!isResizing) return;
            var diff = e.clientX - startX;
            
            // If resizing the last column, prevent expanding to the right
            if (!nextTh && diff > 0) return;

            var newWidth = Math.max(30, startWidth + diff);
            var actualDiff = newWidth - startWidth;
            
            if (nextTh) {
                var newNextWidth = Math.max(30, nextStartWidth - actualDiff);
                var actualNextDiff = nextStartWidth - newNextWidth;
                
                if (actualNextDiff < actualDiff) {
                    newWidth = startWidth + actualNextDiff;
                }
                nextTh.style.width = newNextWidth + 'px';
            }
            startTh.style.width = newWidth + 'px';
        }

        function onMouseUp() {
            if (!isResizing) return;
            isResizing = false;
            var activeHandle = document.querySelector('.resize-handle.active');
            if (activeHandle) activeHandle.classList.remove('active');
            document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // Save all column widths to localStorage
            var widths = {};
            document.querySelectorAll('th[data-column]').forEach(function(th) {
                widths[th.dataset.column] = th.offsetWidth;
            });
            try { localStorage.setItem('explorer-plus-column-widths', JSON.stringify(widths)); } catch(e) {}
        }

        // Identify the last resizable column to disable its handle
        var allCols = document.querySelectorAll('th[data-column]');
        var lastCol = allCols.length > 0 ? allCols[allCols.length - 1] : null;

        document.querySelectorAll('.resize-handle').forEach(function(handle) {
            var th = handle.parentElement;
            
            // Disable resizing for the last column (hide handle and skip listener)
            if (th === lastCol) {
                handle.style.display = 'none';
                return;
            }

            handle.addEventListener('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                isResizing = true;
                startTh = this.parentElement;
                nextTh = startTh.nextElementSibling;
                startX = e.clientX;
                startWidth = startTh.offsetWidth;
                nextStartWidth = nextTh ? nextTh.offsetWidth : 0;
                this.classList.add('active');
                document.body.classList.add('resizing');

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        });
    })();
}());
