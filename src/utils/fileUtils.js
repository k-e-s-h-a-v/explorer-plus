// src/utils/fileUtils.js
const fs = require('fs');
const path = require('path');

/**
 * Recursively calculates the size of a folder.
 * Caution: This can be slow for very large folders or deep directory structures.
 * @param {string} dir The directory path.
 * @returns {number} The total size in bytes.
 */
function getFolderSizeSync(dir) {
    let total = 0;
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            // Skip hidden files/folders (starting with '.')
            if (entry.name.startsWith('.')) continue;

            const fullPath = path.join(dir, entry.name);
            try {
                if (entry.isDirectory()) {
                    total += getFolderSizeSync(fullPath);
                } else if (entry.isFile()) {
                    total += fs.statSync(fullPath).size || 0;
                }
            } catch (err) {
                // Ignore errors like permission denied for individual files/folders
                // console.warn(`Error accessing ${fullPath}: ${err.message}`);
            }
        }
    } catch (err) {
        // Ignore errors for the main directory (e.g., permission denied)
        // console.error(`Error reading directory ${dir}: ${err.message}`);
    }
    return total;
}

/**
 * Formats a size in bytes into a human-readable string (KB, MB, GB).
 * @param {number} size The size in bytes.
 * @returns {string} Formatted size string.
 */
function formatSize(size) {
    if (typeof size !== 'number' || isNaN(size) || size < 0) return '-';
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + ' MB';
    return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Formats a timestamp into a localized date and time string.
 * @param {number} ts The timestamp in milliseconds.
 * @returns {string} Formatted date string.
 */
function formatDate(ts) {
    if (typeof ts !== 'number' || isNaN(ts) || ts === 0) return '';
    const d = new Date(ts);
    return d.toLocaleString();
}

module.exports = {
    getFolderSizeSync,
    formatSize,
    formatDate
};