/**
 * Process Registry - Persistent process tracking
 *
 * Manages a disk-based registry of Halo-managed processes.
 * Uses Instance ID mechanism for safe orphan detection.
 *
 * Location: ~/.halo/.health-registry.json
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { getHaloDir } from '../../config.service';
// ============================================
// Registry State
// ============================================
/** Current app instance ID */
let currentInstanceId = '';
/** Previous instance ID (for cleanup reference) */
let previousInstanceId;
/** In-memory registry cache */
let registryCache = null;
/** Registry file path */
function getRegistryPath() {
    return join(getHaloDir(), '.health-registry.json');
}
// ============================================
// Instance ID Management
// ============================================
/**
 * Mark instance start - MUST be called synchronously at app startup
 *
 * This generates a new instance ID and persists it to disk.
 * The sync operation is intentionally minimal (<1ms) to not affect startup time.
 *
 * @returns The new instance ID
 */
export function markInstanceStart() {
    const registryPath = getRegistryPath();
    const startTime = Date.now();
    // Generate new instance ID
    currentInstanceId = randomUUID();
    // Try to read previous instance ID
    let previousRegistry = null;
    try {
        if (existsSync(registryPath)) {
            const content = readFileSync(registryPath, 'utf-8');
            previousRegistry = JSON.parse(content);
            previousInstanceId = previousRegistry?.instanceId;
        }
    }
    catch (error) {
        console.warn('[Health][Registry] Failed to read previous registry:', error);
    }
    // Create new registry with current instance
    // IMPORTANT: Preserve previous processes for orphan cleanup!
    // They have the old instanceId and will be identified as orphans by getOrphanProcesses()
    const registry = {
        version: 1,
        instanceId: currentInstanceId,
        previousInstanceId,
        startedAt: startTime,
        lastCleanExit: false, // Will be set to true on clean shutdown
        processes: previousRegistry?.processes ?? [] // Preserve for orphan detection
    };
    // Ensure directory exists
    const registryDir = dirname(registryPath);
    if (!existsSync(registryDir)) {
        mkdirSync(registryDir, { recursive: true });
    }
    // Write registry synchronously (intentionally blocking, but <1ms)
    try {
        writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        registryCache = registry;
    }
    catch (error) {
        console.error('[Health][Registry] Failed to write registry:', error);
    }
    const duration = Date.now() - startTime;
    console.log(`[Health][Registry] Instance started: ${currentInstanceId.slice(0, 8)}... (${duration}ms)`);
    return currentInstanceId;
}
/**
 * Get current instance ID
 * Returns empty string if markInstanceStart() hasn't been called
 */
export function getCurrentInstanceId() {
    return currentInstanceId;
}
/**
 * Get previous instance ID (for cleanup reference)
 */
export function getPreviousInstanceId() {
    return previousInstanceId;
}
// ============================================
// Registry Operations
// ============================================
/**
 * Load registry from disk
 */
export function loadRegistry() {
    if (registryCache) {
        return registryCache;
    }
    const registryPath = getRegistryPath();
    try {
        if (!existsSync(registryPath)) {
            return null;
        }
        const content = readFileSync(registryPath, 'utf-8');
        registryCache = JSON.parse(content);
        return registryCache;
    }
    catch (error) {
        console.error('[Health][Registry] Failed to load registry:', error);
        return null;
    }
}
/**
 * Save registry to disk
 */
function saveRegistry(registry) {
    const registryPath = getRegistryPath();
    try {
        writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        registryCache = registry;
    }
    catch (error) {
        console.error('[Health][Registry] Failed to save registry:', error);
    }
}
/**
 * Register a new process
 */
export function registerProcess(entry) {
    const registry = loadRegistry();
    if (!registry) {
        console.warn('[Health][Registry] Cannot register process - no registry');
        return;
    }
    // Check for duplicate
    const existingIndex = registry.processes.findIndex(p => p.id === entry.id && p.type === entry.type);
    const newEntry = {
        ...entry,
        lastHeartbeat: Date.now()
    };
    if (existingIndex >= 0) {
        // Update existing entry
        registry.processes[existingIndex] = newEntry;
    }
    else {
        // Add new entry
        registry.processes.push(newEntry);
    }
    saveRegistry(registry);
    console.log(`[Health][Registry] Registered ${entry.type}: ${entry.id} (PID: ${entry.pid ?? 'unknown'})`);
}
/**
 * Unregister a process
 */
export function unregisterProcess(id, type) {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    const index = registry.processes.findIndex(p => p.id === id && p.type === type);
    if (index >= 0) {
        const removed = registry.processes.splice(index, 1)[0];
        saveRegistry(registry);
        console.log(`[Health][Registry] Unregistered ${type}: ${id} (PID: ${removed.pid ?? 'unknown'})`);
    }
}
/**
 * Update process heartbeat
 */
export function updateHeartbeat(id, type) {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    const entry = registry.processes.find(p => p.id === id && p.type === type);
    if (entry) {
        entry.lastHeartbeat = Date.now();
        saveRegistry(registry);
    }
}
/**
 * Get all processes for current instance
 */
export function getCurrentProcesses() {
    const registry = loadRegistry();
    if (!registry) {
        return [];
    }
    return registry.processes.filter(p => p.instanceId === currentInstanceId);
}
/**
 * Get orphan processes (from previous instances)
 */
export function getOrphanProcesses() {
    const registry = loadRegistry();
    if (!registry) {
        return [];
    }
    return registry.processes.filter(p => p.instanceId !== currentInstanceId);
}
/**
 * Remove orphan entries from registry
 */
export function clearOrphanEntries() {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    const originalCount = registry.processes.length;
    registry.processes = registry.processes.filter(p => p.instanceId === currentInstanceId);
    if (registry.processes.length < originalCount) {
        saveRegistry(registry);
        console.log(`[Health][Registry] Cleared ${originalCount - registry.processes.length} orphan entries`);
    }
}
/**
 * Mark clean exit (called during graceful shutdown)
 */
export function markCleanExit() {
    const registry = loadRegistry();
    if (!registry) {
        return;
    }
    registry.lastCleanExit = true;
    saveRegistry(registry);
    console.log('[Health][Registry] Marked clean exit');
}
/**
 * Check if last exit was clean
 */
export function wasLastExitClean() {
    // We need to check the previous registry state (before markInstanceStart was called)
    // So we check previousInstanceId existence as a proxy
    const registryPath = getRegistryPath();
    try {
        if (!existsSync(registryPath)) {
            return true; // No previous run
        }
        const content = readFileSync(registryPath, 'utf-8');
        const registry = JSON.parse(content);
        // If current instance already started, check the cache
        if (registry.instanceId === currentInstanceId) {
            // We're looking at the current registry - can't determine previous state
            // Return true to avoid unnecessary cleanup
            return true;
        }
        return registry.lastCleanExit;
    }
    catch {
        return true; // Assume clean on error
    }
}
/**
 * Get registry statistics
 */
export function getRegistryStats() {
    const registry = loadRegistry();
    if (!registry) {
        return {
            totalProcesses: 0,
            currentProcesses: 0,
            orphanProcesses: 0
        };
    }
    const currentCount = registry.processes.filter(p => p.instanceId === currentInstanceId).length;
    const orphanCount = registry.processes.length - currentCount;
    return {
        totalProcesses: registry.processes.length,
        currentProcesses: currentCount,
        orphanProcesses: orphanCount
    };
}
//# sourceMappingURL=registry.js.map