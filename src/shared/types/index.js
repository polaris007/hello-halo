/**
 * Shared Types - Cross-process type definitions
 *
 * This module exports all shared types used by both main and renderer processes.
 * Import from this index for clean access to all shared types.
 */
// AI Sources - export constants and functions
export { AVAILABLE_MODELS, DEFAULT_MODEL, createEmptyAISourcesConfig, getCurrentSource, getSourceById, getCurrentModelName, hasAnyAISource, isSourceConfigured, createSource, addSource, updateSource, deleteSource, setCurrentSource, setCurrentModel, getAvailableModels, resolveLocalizedText } from './ai-sources';
// Health System types
export * from './health';
// Artifact types (shared between main process and file-watcher worker)
export * from './artifact';
// Notification channel types (shared between main process and renderer)
export * from './notification-channels';
export { countChangedLines, calculateDiffStats, extractFileChangesSummaryFromThoughts } from '../file-changes';
//# sourceMappingURL=index.js.map