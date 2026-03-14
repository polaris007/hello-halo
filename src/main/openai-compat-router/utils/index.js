/**
 * Utility Functions
 */
export * from './id';
export * from './config';
export * from './url';
/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(input) {
    try {
        return JSON.parse(input);
    }
    catch {
        return null;
    }
}
/**
 * Deep clone an object (using JSON serialization)
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}
/**
 * Check if a value is a non-empty array
 */
export function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}
/**
 * Safely get string content from various formats
 */
export function extractTextContent(content) {
    if (content === null || content === undefined || content === '') {
        return null;
    }
    if (typeof content === 'string') {
        return content;
    }
    // Handle array of content parts
    if (Array.isArray(content)) {
        const parts = content
            .map((part) => {
            if (!part)
                return '';
            if (typeof part === 'string')
                return part;
            if (part.type === 'text' && typeof part.text === 'string')
                return part.text;
            if (part.type === 'output_text' && typeof part.text === 'string')
                return part.text;
            return '';
        })
            .filter(Boolean);
        return parts.length > 0 ? parts.join('') : null;
    }
    // Fallback: convert to string
    return String(content);
}
/**
 * Map a value using a lookup table with default fallback
 */
export function mapValue(value, mapping, defaultValue) {
    if (!value)
        return defaultValue;
    return mapping[value] ?? defaultValue;
}
//# sourceMappingURL=index.js.map