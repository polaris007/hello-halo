/**
 * LLM Config File - Type Definitions
 *
 * This module defines types for the llm-config.json file format.
 * This file stores API-key based AI source configurations separately from the database.
 *
 * File Location: <project-startup-directory>/llm-config.json
 *
 * Design:
 * - JSON format for easy manual editing
 * - Versioned for future format upgrades
 * - Compatible with AISource structure to minimize conversion
 */
// ============================================================================
// Constants
// ============================================================================
/** Current version of LLM config file format */
export const LLM_CONFIG_VERSION = 1;
/** Default file name for LLM config */
export const LLM_CONFIG_FILENAME = 'llm-config.json';
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Create an empty LLM config file structure
 */
export function createEmptyLLMConfigFile() {
    return {
        version: LLM_CONFIG_VERSION,
        currentId: null,
        sources: []
    };
}
/**
 * Validate LLM config source has required fields
 */
export function validateLLMConfigSource(source) {
    const errors = [];
    if (!source.id) {
        errors.push('Missing required field: id');
    }
    if (!source.name) {
        errors.push('Missing required field: name');
    }
    if (!source.provider) {
        errors.push('Missing required field: provider');
    }
    if (!source.apiUrl) {
        errors.push('Missing required field: apiUrl');
    }
    else {
        // Validate URL format
        if (!source.apiUrl.startsWith('http://') && !source.apiUrl.startsWith('https://')) {
            errors.push('apiUrl must start with http:// or https://');
        }
    }
    if (!source.model) {
        errors.push('Missing required field: model');
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
/**
 * Validate entire LLM config file
 */
export function validateLLMConfigFile(config) {
    const errors = [];
    if (config.version === undefined) {
        errors.push('Missing required field: version');
    }
    if (!Array.isArray(config.sources)) {
        errors.push('Missing or invalid field: sources (must be an array)');
    }
    else {
        // Validate each source
        for (let i = 0; i < config.sources.length; i++) {
            const sourceErrors = validateLLMConfigSource(config.sources[i]);
            if (!sourceErrors.valid) {
                errors.push(`Source[${i}]: ${sourceErrors.errors.join(', ')}`);
            }
        }
        // Validate currentId exists in sources
        if (config.currentId && !config.sources.some(s => s.id === config.currentId)) {
            errors.push(`currentId "${config.currentId}" not found in sources`);
        }
    }
    return {
        valid: errors.length === 0,
        errors
    };
}
/**
 * Get current active source from config file
 */
export function getCurrentLLMSource(config) {
    if (!config.currentId)
        return null;
    return config.sources.find(s => s.id === config.currentId) || null;
}
/**
 * Get source by ID from config file
 */
export function getLLMSourceById(config, id) {
    return config.sources.find(s => s.id === id) || null;
}
//# sourceMappingURL=llm-config.js.map