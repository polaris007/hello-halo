/**
 * Process Guardian Module
 *
 * Central module for process tracking and orphan cleanup.
 * Exports all process management functionality.
 */
// Re-export registry functions
export { markInstanceStart, getCurrentInstanceId, getPreviousInstanceId, loadRegistry, registerProcess, unregisterProcess, updateHeartbeat, getCurrentProcesses, getOrphanProcesses, clearOrphanEntries, markCleanExit, wasLastExitClean, getRegistryStats } from './registry';
// Re-export cleaner functions
export { cleanupOrphans, forceKillProcess, isHaloManagedProcess, getRunningHaloProcesses, verifyCleanup } from './cleaner';
// Re-export platform operations
export { getPlatformOps } from './platform';
//# sourceMappingURL=index.js.map