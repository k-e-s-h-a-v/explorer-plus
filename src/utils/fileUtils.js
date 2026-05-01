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
 * Formats a timestamp into a localized date and time string (full format).
 * @param {number} ts The timestamp in milliseconds.
 * @returns {string} Formatted date string.
 */
function formatDate(ts) {
    if (typeof ts !== 'number' || isNaN(ts) || ts === 0) return '';
    const d = new Date(ts);
    return d.toLocaleString();
}

/**
 * Fixed compact date formatter.
 * Always outputs M/D/YY, HH:mm regardless of elapsed time.
 * @param {number} ts The timestamp in milliseconds.
 * @returns {string} Formatted date string.
 */
function formatDateCompact(ts) {
    if (typeof ts !== 'number' || isNaN(ts) || ts === 0) return '';
    const d = new Date(ts);
    const M = d.getMonth() + 1;
    const D = d.getDate();
    const Y = String(d.getFullYear()).slice(-2);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${M}/${D}/${Y}, ${h}:${m}`;
}

/**
 * Relative time formatter with date fallback for old dates.
 * < 1 year → relative (e.g. "3 hours ago" / "3 小時前")
 * ≥ 1 year → date format (e.g. "Nov 18, 2021" / "2021年11月18日")
 * @param {number} ts The timestamp in milliseconds.
 * @returns {string} Relative time string.
 */
function formatDateRelative(ts) {
    if (typeof ts !== 'number' || isNaN(ts) || ts === 0) return '';

    const diff = Date.now() - ts;
    if (diff < 0) return formatDate(ts);

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    // ≥ 1 year → fall back to date format
    if (days >= 365) {
        const d = new Date(ts);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // < 1 year → relative time
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

    if (seconds < 60) {
        return 'just now';
    } else if (minutes < 60) {
        return rtf.format(-minutes, 'minute');
    } else if (hours < 24) {
        return rtf.format(-hours, 'hour');
    } else if (days < 7) {
        return rtf.format(-days, 'day');
    } else if (days < 30) {
        return rtf.format(-Math.floor(days / 7), 'week');
    } else {
        return rtf.format(-Math.floor(days / 30), 'month');
    }
}

module.exports = {
    getFolderSizeSync,
    formatSize,
    formatDate,
    formatDateCompact,
    formatDateRelative
};