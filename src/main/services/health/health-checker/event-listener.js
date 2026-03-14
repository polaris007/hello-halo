/**
 * Event Listener - Event-driven health monitoring
 *
 * Listens for critical events and triggers appropriate responses.
 * This is the primary monitoring mechanism - polling is just a fallback.
 */
// Registered event handlers
const eventHandlers = [];
// Recent events buffer (for diagnostics)
const MAX_RECENT_EVENTS = 50;
const recentEvents = [];
// Error counters for escalation
const errorCounters = new Map();
// Counter reset interval (1 minute)
const COUNTER_RESET_MS = 60_000;
/**
 * Register a health event handler
 *
 * @param handler - Function to call when health events occur
 * @returns Unsubscribe function
 */
export function onHealthEvent(handler) {
    eventHandlers.push(handler);
    return () => {
        const index = eventHandlers.indexOf(handler);
        if (index > -1) {
            eventHandlers.splice(index, 1);
        }
    };
}
/**
 * Emit a health event
 */
export function emitHealthEvent(type, category, source, message, data) {
    const event = {
        type,
        category,
        timestamp: Date.now(),
        source,
        message,
        data
    };
    // Add to recent events buffer
    recentEvents.unshift(event);
    if (recentEvents.length > MAX_RECENT_EVENTS) {
        recentEvents.pop();
    }
    // Log the event
    const icon = category === 'critical' ? '🔴' : category === 'warning' ? '🟡' : '🔵';
    console.log(`[Health][Event] ${icon} ${type}: ${message} (source: ${source})`);
    // Notify all handlers
    for (const handler of eventHandlers) {
        try {
            handler(event);
        }
        catch (error) {
            console.error('[Health][Event] Handler error:', error);
        }
    }
}
/**
 * Track error occurrence for escalation
 *
 * @param source - Error source identifier
 * @returns Current consecutive error count
 */
export function trackError(source) {
    const now = Date.now();
    const counter = errorCounters.get(source);
    if (counter) {
        // Reset counter if too much time has passed
        if (now - counter.lastTime > COUNTER_RESET_MS) {
            counter.count = 1;
            counter.lastTime = now;
        }
        else {
            counter.count++;
            counter.lastTime = now;
        }
        return counter.count;
    }
    else {
        errorCounters.set(source, { count: 1, lastTime: now });
        return 1;
    }
}
/**
 * Reset error counter for a source
 */
export function resetErrorCounter(source) {
    errorCounters.delete(source);
}
/**
 * Get error count for a source
 */
export function getErrorCount(source) {
    const counter = errorCounters.get(source);
    return counter?.count ?? 0;
}
/**
 * Get total error count across all sources
 * Used by passive polling to check overall health
 */
export function getTotalErrorCount() {
    let total = 0;
    for (const counter of errorCounters.values()) {
        total += counter.count;
    }
    return total;
}
/**
 * Get recent health events
 */
export function getRecentEvents() {
    return [...recentEvents];
}
/**
 * Clear recent events
 */
export function clearRecentEvents() {
    recentEvents.length = 0;
}
// ============================================
// Event Emission Helpers
// ============================================
/**
 * Emit agent error event
 *
 * Note: source includes 'agent' prefix for S2 recovery strategy matching
 * (selectRecoveryStrategy checks source.includes('agent'))
 */
export function emitAgentError(conversationId, error, data) {
    const count = trackError(`agent:${conversationId}`);
    emitHealthEvent('agent_error', count >= 3 ? 'critical' : 'warning', `agent:${conversationId}`, // Include 'agent' prefix for S2 strategy matching
    error, { ...data, consecutiveErrors: count, conversationId });
}
/**
 * Emit process exit event
 */
export function emitProcessExit(processId, exitCode, signal) {
    emitHealthEvent('process_exit', 'critical', processId, `Process exited with code ${exitCode}, signal ${signal}`, { exitCode, signal });
}
/**
 * Emit renderer crash event
 */
export function emitRendererCrash(reason) {
    emitHealthEvent('renderer_crash', 'critical', 'renderer', `Renderer crashed: ${reason}`, { reason });
}
/**
 * Emit renderer unresponsive event
 */
export function emitRendererUnresponsive() {
    emitHealthEvent('renderer_unresponsive', 'warning', 'renderer', 'Renderer became unresponsive');
}
/**
 * Emit network error event
 */
export function emitNetworkError(source, status, message) {
    const count = trackError(`network:${source}`);
    const isCritical = status >= 500 || message.includes('ECONNREFUSED');
    emitHealthEvent('network_error', isCritical ? 'critical' : 'warning', source, `Network error: ${status} - ${message}`, { status, consecutiveErrors: count });
}
/**
 * Emit config change event
 */
export function emitConfigChange(changedFields) {
    emitHealthEvent('config_change', 'info', 'config', `Config changed: ${changedFields.join(', ')}`, { changedFields });
}
/**
 * Emit recovery success event
 */
export function emitRecoverySuccess(strategyId, message) {
    emitHealthEvent('recovery_success', 'info', strategyId, message);
    // Reset error counters on successful recovery
    errorCounters.clear();
}
/**
 * Emit startup check event
 */
export function emitStartupCheck(status, duration) {
    emitHealthEvent('startup_check', status === 'healthy' ? 'info' : 'warning', 'startup', `Startup checks completed: ${status} (${duration}ms)`, { duration });
}
//# sourceMappingURL=event-listener.js.map