/**
 * File Changes - Shared diff statistics and file change extraction
 *
 * Pure utility functions for computing diff statistics from tool_use thoughts.
 * Used by both main process (send-message) and renderer (diff/utils).
 *
 * Zero platform dependencies - only operates on plain data.
 */
// ============================================
// Diff Statistics
// ============================================
/**
 * Count lines in newStr that don't exist in oldStr (trimmed, non-empty).
 */
export function countChangedLines(oldStr, newStr) {
    if (!oldStr || !newStr)
        return 0;
    const oldLines = new Set(oldStr.split('\n').map(l => l.trim()).filter(Boolean));
    const newLines = new Set(newStr.split('\n').map(l => l.trim()).filter(Boolean));
    let changes = 0;
    for (const line of newLines) {
        if (!oldLines.has(line))
            changes++;
    }
    return changes;
}
/**
 * Calculate line diff statistics.
 */
export function calculateDiffStats(oldStr, newStr) {
    const oldLines = oldStr ? oldStr.split('\n') : [];
    const newLines = newStr ? newStr.split('\n') : [];
    const changed = countChangedLines(oldStr, newStr);
    const added = Math.max(0, newLines.length - oldLines.length + changed);
    const removed = Math.max(0, oldLines.length - newLines.length + changed);
    return {
        added: Math.max(1, Math.ceil(added / 2)),
        removed: Math.max(oldStr ? 1 : 0, Math.ceil(removed / 2))
    };
}
// ============================================
// File Changes Extraction
// ============================================
/**
 * Extract lightweight file changes summary from thoughts.
 * Processes Write and Edit tool calls to produce compact statistics.
 */
export function extractFileChangesSummaryFromThoughts(thoughts) {
    const edited = [];
    const created = [];
    let totalAdded = 0;
    let totalRemoved = 0;
    const processedIds = new Set();
    for (const thought of thoughts) {
        if (thought.type !== 'tool_use')
            continue;
        if (processedIds.has(thought.id))
            continue;
        processedIds.add(thought.id);
        const input = thought.toolInput;
        if (!input)
            continue;
        if (thought.toolName === 'Write') {
            const filePath = input.file_path;
            const content = input.content;
            if (!filePath)
                continue;
            const existingIndex = created.findIndex(w => w.file === filePath);
            if (existingIndex >= 0) {
                totalAdded -= created[existingIndex].lines;
                created.splice(existingIndex, 1);
            }
            const lineCount = content ? content.split('\n').length : 0;
            created.push({ file: filePath, lines: lineCount });
            totalAdded += lineCount;
        }
        else if (thought.toolName === 'Edit') {
            const filePath = input.file_path;
            const oldString = input.old_string;
            const newString = input.new_string;
            if (!filePath || (oldString === undefined && newString === undefined))
                continue;
            const stats = calculateDiffStats(oldString || '', newString || '');
            const existingIndex = edited.findIndex(e => e.file === filePath);
            if (existingIndex >= 0) {
                edited[existingIndex].added += stats.added;
                edited[existingIndex].removed += stats.removed;
            }
            else {
                edited.push({ file: filePath, added: stats.added, removed: stats.removed });
            }
            totalAdded += stats.added;
            totalRemoved += stats.removed;
        }
    }
    const totalFiles = edited.length + created.length;
    if (totalFiles === 0)
        return undefined;
    return { edited, created, totalFiles, totalAdded, totalRemoved };
}
//# sourceMappingURL=file-changes.js.map