/**
 * Converts a timestamp to a formatted date string.
 * Handles timezone conversion.
 * @param {number|string|Date} timestamp - The timestamp to format.
 * @param {string} timezone - The timezone (e.g., 'UTC', 'Europe/Rome').
 * @returns {string} - The formatted date string.
 */
export function formatTimestamp(timestamp, timezone = 'UTC') {
    if (!timestamp) return 'Invalid Date';
    const date = toDate(timestamp);
    return date.toLocaleString('en-GB', { timeZone: timezone });
}

/**
 * Converts a timestamp to ISO format for file downloads.
 * @param {number|string|Date} timestamp - The timestamp to format.
 * @returns {string} - The ISO formatted date string.
 */
export function formatTimestampForFile(timestamp) {
    if (!timestamp) return '1970-01-01T00:00:00Z';
    const date = toDate(timestamp);
    return date.toISOString();
}

/**
 * Normalize various timestamp formats to a Date object.
 * Accepts Date, number (seconds or milliseconds), numeric strings, and ISO-like strings.
 */
export function toDate(timestamp) {
    if (!timestamp) return new Date(0);
    if (timestamp instanceof Date) return timestamp;

    // Numbers: decide if seconds (<= 11 digits) or milliseconds
    if (typeof timestamp === 'number') {
        if (timestamp < 100000000000) return new Date(timestamp * 1000);
        return new Date(timestamp);
    }

    if (typeof timestamp === 'string') {
        const num = Number(timestamp);
        if (!Number.isNaN(num)) {
            if (num < 100000000000) return new Date(num * 1000);
            return new Date(num);
        }

        // Handle common non-ISO format like "YYYY-MM-DD HH:mm:ss" by converting space to 'T'
        const isoLike = timestamp.includes(' ') && !timestamp.includes('T')
            ? timestamp.replace(' ', 'T')
            : timestamp;

        return new Date(isoLike);
    }

    return new Date(timestamp);
}
