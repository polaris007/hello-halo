/**
 * apps/runtime -- Error Types
 *
 * Domain-specific errors for the App execution engine.
 */
/**
 * Thrown when attempting to execute an App that is not in a runnable state.
 */
export class AppNotRunnableError extends Error {
    name = 'AppNotRunnableError';
    appId;
    status;
    constructor(appId, status) {
        super(`App ${appId} is not runnable (status: ${status})`);
        this.appId = appId;
        this.status = status;
    }
}
/**
 * Thrown when attempting to activate an App that has no subscriptions.
 */
export class NoSubscriptionsError extends Error {
    name = 'NoSubscriptionsError';
    appId;
    constructor(appId) {
        super(`App ${appId} has no subscriptions to activate`);
        this.appId = appId;
    }
}
/**
 * Thrown when a trigger is rejected due to a concurrency constraint.
 *
 * Two cases:
 * - Per-app limit (isPerApp=true): the same app is already running or queued.
 *   The caller should inform the user/AI the app is busy.
 * - Global limit (isPerApp=false): the global semaphore is saturated and
 *   the caller opted not to queue (reserved for future non-blocking paths).
 */
export class ConcurrencyLimitError extends Error {
    name = 'ConcurrencyLimitError';
    maxConcurrent;
    /** True when the same app is already running or queued (per-app dedup). */
    isPerApp;
    appId;
    constructor(maxConcurrent, appId) {
        const msg = appId
            ? `App is already running or queued. Wait for it to complete before triggering again.`
            : `Concurrency limit reached (max: ${maxConcurrent} concurrent runs)`;
        super(msg);
        this.maxConcurrent = maxConcurrent;
        this.isPerApp = !!appId;
        this.appId = appId;
    }
}
/**
 * Thrown when an escalation entry is not found or has already been responded to.
 */
export class EscalationNotFoundError extends Error {
    name = 'EscalationNotFoundError';
    appId;
    entryId;
    constructor(appId, entryId) {
        super(`Escalation not found: app=${appId}, entry=${entryId}`);
        this.appId = appId;
        this.entryId = entryId;
    }
}
/**
 * Thrown when an App execution fails due to an Agent/SDK error.
 */
export class RunExecutionError extends Error {
    name = 'RunExecutionError';
    appId;
    runId;
    constructor(appId, runId, cause) {
        super(`Run execution failed: app=${appId}, run=${runId}: ${cause}`);
        this.appId = appId;
        this.runId = runId;
    }
}
//# sourceMappingURL=errors.js.map