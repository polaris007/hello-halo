/**
 * AI Sources - Unified Type Definitions (v2)
 *
 * This module defines all types related to AI source providers.
 * These types are shared between main process and renderer.
 *
 * Design Principles:
 * - Single source of truth for all AI-related types
 * - Extensible for future providers
 * - Minimal coupling with specific provider implementations
 * - All sources use unified AISource structure
 *
 * Version History:
 * - v1: Separate custom/oauth configs with dynamic keys
 * - v2: Unified AISource array structure (current)
 */
import { v4 as uuidv4 } from 'uuid';
/**
 * Resolve LocalizedText to a string for the given locale.
 * Falls back: exact match -> prefix match -> 'en' -> first value.
 */
export function resolveLocalizedText(value, locale) {
    if (typeof value === 'string')
        return value;
    if (value[locale])
        return value[locale];
    const prefix = locale.split('-')[0];
    const match = Object.keys(value).find(k => k.startsWith(prefix));
    if (match)
        return value[match];
    return value['en'] || Object.values(value)[0] || '';
}
/**
 * Available Claude models (legacy, for backward compatibility)
 */
export const AVAILABLE_MODELS = [
    {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6',
        description: 'Most powerful model, great for complex reasoning and architecture decisions'
    },
    {
        id: 'claude-opus-4-5-20251101',
        name: 'Claude Opus 4.5',
        description: 'great for complex reasoning and architecture decisions'
    },
    {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6',
        description: 'Balanced performance and cost, suitable for most tasks'
    },
    {
        id: 'claude-sonnet-4-5-20250929',
        name: 'Claude Sonnet 4.5',
        description: 'Balanced performance and cost, suitable for most tasks'
    },
    {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        description: 'Fast and lightweight, ideal for simple tasks'
    }
];
export const DEFAULT_MODEL = 'claude-sonnet-4-6';
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Create empty AI Sources config
 */
export function createEmptyAISourcesConfig() {
    return {
        version: 2,
        currentId: null,
        sources: []
    };
}
/**
 * Get current active source
 */
export function getCurrentSource(config) {
    if (!config.currentId)
        return null;
    return config.sources.find(s => s.id === config.currentId) || null;
}
/**
 * Get source by ID
 */
export function getSourceById(config, id) {
    return config.sources.find(s => s.id === id) || null;
}
/**
 * Get current model display name
 */
export function getCurrentModelName(config) {
    const source = getCurrentSource(config);
    if (!source)
        return 'No model';
    const modelOption = source.availableModels.find(m => m.id === source.model);
    return modelOption?.name || source.model;
}
/**
 * Check if any AI source is configured and ready to use
 */
export function hasAnyAISource(config) {
    return config.sources.length > 0 && config.sources.some(s => {
        if (s.authType === 'api-key') {
            return !!s.apiKey;
        }
        return !!s.accessToken;
    });
}
/**
 * Check if a specific source is configured
 */
export function isSourceConfigured(source) {
    if (source.authType === 'api-key') {
        return !!source.apiKey;
    }
    return !!source.accessToken;
}
/**
 * Create a new AI Source
 */
export function createSource(params) {
    const now = new Date().toISOString();
    return {
        id: uuidv4(),
        name: params.name,
        provider: params.provider,
        authType: params.authType,
        apiUrl: params.apiUrl,
        apiKey: params.apiKey,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        tokenExpires: params.tokenExpires,
        user: params.user,
        model: params.model,
        availableModels: params.availableModels,
        createdAt: now,
        updatedAt: now
    };
}
/**
 * Add source to config
 */
export function addSource(config, source) {
    return {
        ...config,
        sources: [...config.sources, source],
        // Auto-select if no current source
        currentId: config.currentId || source.id
    };
}
/**
 * Update a source
 */
export function updateSource(config, id, updates) {
    return {
        ...config,
        sources: config.sources.map(s => s.id === id
            ? { ...s, ...updates, updatedAt: new Date().toISOString() }
            : s)
    };
}
/**
 * Delete a source
 */
export function deleteSource(config, id) {
    const newSources = config.sources.filter(s => s.id !== id);
    let newCurrentId = config.currentId;
    // If deleted was current, switch to first available
    if (config.currentId === id) {
        newCurrentId = newSources.length > 0 ? newSources[0].id : null;
    }
    return {
        ...config,
        sources: newSources,
        currentId: newCurrentId
    };
}
/**
 * Set current source
 */
export function setCurrentSource(config, id) {
    if (!config.sources.some(s => s.id === id)) {
        return config; // ID doesn't exist
    }
    return { ...config, currentId: id };
}
/**
 * Set model for current source
 */
export function setCurrentModel(config, modelId) {
    if (!config.currentId)
        return config;
    return updateSource(config, config.currentId, { model: modelId });
}
/**
 * Get available models for a source
 */
export function getAvailableModels(source) {
    return source.availableModels || [];
}
//# sourceMappingURL=ai-sources.js.map