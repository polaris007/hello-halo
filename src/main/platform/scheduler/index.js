/**
 * platform/scheduler -- Public API
 *
 * Persistent job scheduling engine for the Halo platform layer.
 * This is a general-purpose engine: it does not know about AI, LLM, or Apps.
 *
 * Usage in bootstrap/extended.ts:
 *
 *   import { initScheduler, shutdownScheduler } from '../platform/scheduler'
 *
 *   const scheduler = await initScheduler({ db })
 *   scheduler.onJobDue(async (job) => {
 *     // ... execute the job
 *     return 'useful'
 *   })
 *   scheduler.start()
 *
 *   // On shutdown:
 *   scheduler.stop()
 */
import { randomUUID } from 'crypto';
import { SchedulerStore } from './store';
import { SchedulerTimer } from './timer';
import { computeNextRun } from './schedule';
// Re-export for testing
export { computeNextRun, computeNextRunEvery, computeNextRunCron, parseEveryString } from './schedule';
// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------
let serviceInstance = null;
/**
 * Initialize the scheduler module.
 *
 * Creates the persistence layer, timer engine, and returns the
 * SchedulerService interface. Must be called after `initStore()`.
 *
 * @param deps - Dependencies. Currently only `db` (DatabaseManager).
 * @returns The SchedulerService instance.
 */
export async function initScheduler(deps) {
    if (serviceInstance) {
        return serviceInstance;
    }
    const start = performance.now();
    const store = new SchedulerStore(deps.db);
    const timer = new SchedulerTimer(store);
    const service = {
        // -- Job CRUD --
        addJob(input) {
            const now = Date.now();
            const id = input.id || randomUUID();
            const anchorMs = now;
            // Compute the first run time
            let nextRunAtMs;
            try {
                const next = computeNextRun(input.schedule, anchorMs, now);
                nextRunAtMs = next ?? 0;
            }
            catch (err) {
                throw new Error(`Failed to compute initial run time for job "${input.name}": ${err instanceof Error ? err.message : String(err)}`);
            }
            const job = {
                id,
                name: input.name,
                schedule: input.schedule,
                enabled: input.enabled,
                metadata: input.metadata,
                anchorMs,
                nextRunAtMs,
                consecutiveErrors: 0,
                status: 'idle',
                createdAt: now,
                updatedAt: now
            };
            store.insertJob(job);
            timer.rearm();
            console.log(`[Scheduler] Job added: "${job.name}" (${job.id}), ` +
                `schedule: ${job.schedule.kind}, next run: ${new Date(nextRunAtMs).toISOString()}`);
            return id;
        },
        removeJob(jobId) {
            const job = store.getJob(jobId);
            if (!job)
                return;
            store.deleteJob(jobId);
            timer.rearm();
            console.log(`[Scheduler] Job removed: "${job.name}" (${jobId})`);
        },
        updateJob(jobId, updates) {
            const job = store.getJob(jobId);
            if (!job) {
                throw new Error(`Scheduler job not found: ${jobId}`);
            }
            const now = Date.now();
            let scheduleChanged = false;
            if (updates.name !== undefined) {
                job.name = updates.name;
            }
            if (updates.schedule !== undefined) {
                job.schedule = updates.schedule;
                scheduleChanged = true;
            }
            if (updates.enabled !== undefined) {
                job.enabled = updates.enabled;
                if (updates.enabled && (job.status === 'paused' || job.status === 'disabled')) {
                    job.status = 'idle';
                    job.consecutiveErrors = 0;
                    scheduleChanged = true;
                }
            }
            if (updates.metadata !== undefined) {
                job.metadata = updates.metadata;
            }
            // Recompute next run if schedule changed
            if (scheduleChanged && job.enabled) {
                try {
                    const next = computeNextRun(job.schedule, job.anchorMs, now);
                    if (next !== undefined) {
                        job.nextRunAtMs = next;
                    }
                }
                catch {
                    // Keep existing nextRunAtMs
                }
            }
            job.updatedAt = now;
            store.updateJob(job);
            timer.rearm();
            console.log(`[Scheduler] Job updated: "${job.name}" (${jobId})`);
        },
        pauseJob(jobId) {
            const job = store.getJob(jobId);
            if (!job) {
                throw new Error(`Scheduler job not found: ${jobId}`);
            }
            if (job.status === 'running') {
                console.warn(`[Scheduler] Cannot pause running job "${job.name}" (${jobId})`);
                return;
            }
            job.status = 'paused';
            job.updatedAt = Date.now();
            store.updateJob(job);
            timer.rearm();
            console.log(`[Scheduler] Job paused: "${job.name}" (${jobId})`);
        },
        resumeJob(jobId) {
            const job = store.getJob(jobId);
            if (!job) {
                throw new Error(`Scheduler job not found: ${jobId}`);
            }
            if (job.status !== 'paused' && job.status !== 'disabled') {
                return; // Already active
            }
            const now = Date.now();
            job.status = 'idle';
            job.enabled = true;
            job.consecutiveErrors = 0;
            // Recompute next run from now
            try {
                const next = computeNextRun(job.schedule, job.anchorMs, now);
                if (next !== undefined) {
                    job.nextRunAtMs = next;
                }
            }
            catch {
                // Keep existing
            }
            job.updatedAt = now;
            store.updateJob(job);
            timer.rearm();
            console.log(`[Scheduler] Job resumed: "${job.name}" (${jobId}), ` +
                `next run: ${new Date(job.nextRunAtMs).toISOString()}`);
        },
        getJob(jobId) {
            return store.getJob(jobId);
        },
        listJobs(filter) {
            return store.listJobs(filter);
        },
        // -- Execution --
        onJobDue(handler) {
            timer.setHandler(handler);
        },
        start() {
            timer.start();
        },
        stop() {
            timer.stop();
        },
        // -- Observability --
        getRunLog(jobId, limit) {
            return store.getRunLog(jobId, limit);
        },
        getRunStats(jobId, since) {
            return store.getRunStats(jobId, since);
        }
    };
    serviceInstance = service;
    const duration = performance.now() - start;
    const jobCount = store.getEnabledJobs().length;
    console.log(`[Scheduler] Initialized in ${duration.toFixed(1)}ms ` +
        `(${jobCount} existing job(s))`);
    return service;
}
/**
 * Shutdown the scheduler module.
 *
 * Stops the timer loop and clears the singleton reference.
 * Does not cancel in-flight job executions.
 */
export async function shutdownScheduler() {
    if (serviceInstance) {
        serviceInstance.stop();
        serviceInstance = null;
        console.log('[Scheduler] Shutdown complete');
    }
}
//# sourceMappingURL=index.js.map