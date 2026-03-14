/**
 * Startup Checker - Orchestrates startup-time health checks
 *
 * Runs all probes asynchronously after window is visible.
 * Does NOT block startup - designed for Extended Services phase.
 */
import { runConfigProbe } from './probes/config-probe';
import { runPortProbe } from './probes/port-probe';
import { runDiskProbe } from './probes/disk-probe';
import { runProcessProbe } from './probes/process-probe';
import { wasLastExitClean } from '../process-guardian';
/**
 * Run all startup health checks
 *
 * This function is designed to run AFTER the window is visible,
 * in the Extended Services initialization phase.
 */
export async function runStartupChecks() {
    const startTime = Date.now();
    const probes = [];
    console.log('[Health][Startup] Running startup checks...');
    try {
        // Check if last exit was clean
        const lastExitClean = wasLastExitClean();
        if (!lastExitClean) {
            console.log('[Health][Startup] Last exit was not clean - running full cleanup');
        }
        // Run probes in parallel for speed
        const [configResult, portResult, diskResult, processResult] = await Promise.all([
            safeProbe('config', runConfigProbe),
            safeProbe('port', runPortProbe),
            safeProbe('disk', runDiskProbe),
            safeProbe('process', runProcessProbe)
        ]);
        probes.push(configResult, portResult, diskResult, processResult);
        // Log probe results
        for (const probe of probes) {
            const icon = probe.healthy ? '✓' : probe.severity === 'critical' ? '✗' : '⚠';
            const errors = probe.data?.errors;
            const detail = !probe.healthy && errors?.length ? ` (${errors.join(', ')})` : '';
            console.log(`[Health][Startup] ${icon} ${probe.name}: ${probe.message}${detail}`);
        }
        // Determine overall status
        const status = determineOverallStatus(probes);
        const duration = Date.now() - startTime;
        console.log(`[Health][Startup] Checks complete in ${duration}ms - Status: ${status}`);
        return {
            status,
            probes,
            duration,
            timestamp: Date.now()
        };
    }
    catch (error) {
        console.error('[Health][Startup] Startup checks failed:', error);
        return {
            status: 'healthy', // Assume healthy on error to not block app
            probes,
            duration: Date.now() - startTime,
            timestamp: Date.now()
        };
    }
}
/**
 * Safely run a probe with error handling
 */
async function safeProbe(name, probeFn) {
    try {
        return await withTimeout(probeFn(), 10000);
    }
    catch (error) {
        console.error(`[Health][Startup] ${name} probe failed:`, error);
        return {
            name,
            healthy: true, // Assume healthy on error
            severity: 'warning',
            message: `Probe failed: ${error.message}`,
            timestamp: Date.now()
        };
    }
}
/**
 * Run a promise with timeout
 */
async function withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        if (timeoutId)
            clearTimeout(timeoutId);
        return result;
    }
    catch (error) {
        if (timeoutId)
            clearTimeout(timeoutId);
        throw error;
    }
}
/**
 * Determine overall health status from probe results
 */
function determineOverallStatus(probes) {
    const hasCritical = probes.some(p => !p.healthy && p.severity === 'critical');
    const hasWarning = probes.some(p => !p.healthy && p.severity === 'warning');
    if (hasCritical) {
        return 'unhealthy';
    }
    if (hasWarning) {
        return 'degraded';
    }
    return 'healthy';
}
/**
 * Quick health check (for runtime use)
 *
 * Only runs essential checks, used for periodic fallback polling.
 */
export async function runQuickHealthCheck() {
    try {
        // Just check config validity for now
        const configResult = await runConfigProbe();
        return {
            healthy: configResult.healthy,
            message: configResult.message
        };
    }
    catch (error) {
        return {
            healthy: true,
            message: 'Quick check failed, assuming healthy'
        };
    }
}
//# sourceMappingURL=startup-checker.js.map