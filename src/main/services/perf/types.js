/**
 * Performance Monitoring Module - Type Definitions
 *
 * Provides types for the performance monitoring system.
 * This is a development/debugging feature, not analytics.
 */
export const DEFAULT_PERF_CONFIG = {
    enabled: false,
    sampleInterval: 2000,
    maxSamples: 300, // 10 minutes at 2s interval
    logToFile: false,
    warnOnThreshold: true,
};
export const DEFAULT_THRESHOLDS = {
    heapUsedMB: 500,
    rssMB: 1000,
    cpuPercent: 80,
    browserViewCount: 10,
    slowIpcCalls: 5,
    minFps: 30,
    longTasksCount: 3,
    rendererHeapMB: 300,
};
// ============================================
// IPC Events
// ============================================
export const PerfChannels = {
    // Commands (renderer -> main)
    START: 'perf:start',
    STOP: 'perf:stop',
    GET_STATE: 'perf:get-state',
    GET_HISTORY: 'perf:get-history',
    CLEAR_HISTORY: 'perf:clear-history',
    SET_CONFIG: 'perf:set-config',
    EXPORT: 'perf:export',
    // Renderer metrics reporting (renderer -> main)
    RENDERER_METRICS: 'perf:renderer-metrics',
    // Events (main -> renderer)
    SNAPSHOT: 'perf:snapshot',
    WARNING: 'perf:warning',
};
//# sourceMappingURL=types.js.map