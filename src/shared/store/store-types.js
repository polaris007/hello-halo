/**
 * Shared Store Types
 *
 * Pure TypeScript type definitions for the Store / Registry system.
 * These types are used by both the main process and the renderer process.
 *
 * IMPORTANT: This file must NOT import any Node.js or Electron APIs.
 * It is included in the renderer (web) tsconfig.
 */
// ============================================
// Store Categories
// ============================================
/** Predefined store categories */
export const STORE_CATEGORIES = [
    'shopping',
    'news',
    'content',
    'dev-tools',
    'productivity',
    'data',
    'social',
    'other',
];
/** Category metadata for UI rendering */
export const STORE_CATEGORY_META = [
    { id: 'shopping', labelKey: 'Shopping', icon: '🛒' },
    { id: 'news', labelKey: 'News', icon: '📰' },
    { id: 'content', labelKey: 'Content', icon: '✍️' },
    { id: 'dev-tools', labelKey: 'Dev Tools', icon: '🛠️' },
    { id: 'productivity', labelKey: 'Productivity', icon: '⚡' },
    { id: 'data', labelKey: 'Data', icon: '📊' },
    { id: 'social', labelKey: 'Social', icon: '💬' },
    { id: 'other', labelKey: 'Other', icon: '📦' },
];
//# sourceMappingURL=store-types.js.map