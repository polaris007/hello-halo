/**
 * apps/runtime -- Activity Store
 *
 * SQLite CRUD operations for automation_runs and activity_entries.
 * All methods are synchronous (better-sqlite3 is synchronous).
 */
// ============================================
// Row <-> Domain Conversions
// ============================================
function rowToRun(row) {
    return {
        runId: row.run_id,
        appId: row.app_id,
        sessionKey: row.session_key,
        status: row.status,
        triggerType: row.trigger_type,
        triggerData: row.trigger_data_json ? JSON.parse(row.trigger_data_json) : undefined,
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? undefined,
        durationMs: row.duration_ms ?? undefined,
        tokensUsed: row.tokens_used ?? undefined,
        errorMessage: row.error_message ?? undefined,
    };
}
function rowToEntry(row) {
    return {
        id: row.id,
        appId: row.app_id,
        runId: row.run_id,
        type: row.type,
        ts: row.ts,
        sessionKey: row.session_key ?? undefined,
        content: JSON.parse(row.content_json),
        userResponse: row.user_response_json
            ? JSON.parse(row.user_response_json)
            : undefined,
    };
}
// ============================================
// Activity Store
// ============================================
/** Default retention period: 1 year in milliseconds */
const DEFAULT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
/**
 * SQLite store for automation runs and activity entries.
 *
 * Uses prepared statements for performance.
 * All methods are synchronous (better-sqlite3).
 */
export class ActivityStore {
    db;
    // Prepared statements
    stmtInsertRun;
    stmtGetRun;
    stmtGetRunsForApp;
    stmtUpdateRunStatus;
    stmtUpdateRunComplete;
    stmtInsertEntry;
    stmtGetEntry;
    stmtGetEntriesForApp;
    stmtGetEntriesForAppWithType;
    stmtGetEntriesForAppSince;
    stmtUpdateEntryResponse;
    stmtGetPendingEscalation;
    stmtGetAllPendingEscalations;
    stmtGetRunningRunForApp;
    stmtGetLatestRunForApp;
    stmtGetEntriesForRun;
    constructor(db) {
        this.db = db;
        // ── Run statements ──────────────────────────
        this.stmtInsertRun = db.prepare(`
      INSERT INTO automation_runs
        (run_id, app_id, session_key, status, trigger_type, trigger_data_json, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        this.stmtGetRun = db.prepare(`
      SELECT * FROM automation_runs WHERE run_id = ?
    `);
        this.stmtGetRunsForApp = db.prepare(`
      SELECT * FROM automation_runs WHERE app_id = ? ORDER BY started_at DESC LIMIT ?
    `);
        this.stmtUpdateRunStatus = db.prepare(`
      UPDATE automation_runs SET status = ?, error_message = ? WHERE run_id = ?
    `);
        this.stmtUpdateRunComplete = db.prepare(`
      UPDATE automation_runs
      SET status = ?, finished_at = ?, duration_ms = ?, tokens_used = ?, error_message = ?
      WHERE run_id = ?
    `);
        this.stmtGetRunningRunForApp = db.prepare(`
      SELECT * FROM automation_runs WHERE app_id = ? AND status = 'running' LIMIT 1
    `);
        this.stmtGetLatestRunForApp = db.prepare(`
      SELECT * FROM automation_runs WHERE app_id = ? ORDER BY started_at DESC LIMIT 1
    `);
        // ── Entry statements ────────────────────────
        this.stmtInsertEntry = db.prepare(`
      INSERT INTO activity_entries
        (id, app_id, run_id, type, ts, session_key, content_json, user_response_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
        this.stmtGetEntry = db.prepare(`
      SELECT * FROM activity_entries WHERE id = ?
    `);
        this.stmtGetEntriesForApp = db.prepare(`
      SELECT * FROM activity_entries WHERE app_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?
    `);
        this.stmtGetEntriesForAppWithType = db.prepare(`
      SELECT * FROM activity_entries WHERE app_id = ? AND type = ? ORDER BY ts DESC LIMIT ? OFFSET ?
    `);
        this.stmtGetEntriesForAppSince = db.prepare(`
      SELECT * FROM activity_entries WHERE app_id = ? AND ts < ? ORDER BY ts DESC LIMIT ? OFFSET ?
    `);
        this.stmtUpdateEntryResponse = db.prepare(`
      UPDATE activity_entries SET user_response_json = ? WHERE id = ?
    `);
        this.stmtGetPendingEscalation = db.prepare(`
      SELECT * FROM activity_entries
      WHERE app_id = ? AND id = ? AND type = 'escalation' AND user_response_json IS NULL
    `);
        this.stmtGetAllPendingEscalations = db.prepare(`
      SELECT * FROM activity_entries
      WHERE type = 'escalation' AND user_response_json IS NULL
      ORDER BY ts ASC
    `);
        this.stmtGetEntriesForRun = db.prepare(`
      SELECT * FROM activity_entries WHERE run_id = ? ORDER BY ts DESC
    `);
    }
    // ── Run Operations ────────────────────────────
    /** Insert a new automation run record */
    insertRun(run) {
        this.stmtInsertRun.run(run.runId, run.appId, run.sessionKey, run.status, run.triggerType, run.triggerData ? JSON.stringify(run.triggerData) : null, run.startedAt);
    }
    /** Get a run by ID */
    getRun(runId) {
        const row = this.stmtGetRun.get(runId);
        return row ? rowToRun(row) : null;
    }
    /** Get runs for an App, ordered by most recent first */
    getRunsForApp(appId, limit = 50) {
        const rows = this.stmtGetRunsForApp.all(appId, limit);
        return rows.map(rowToRun);
    }
    /** Update run status (without completion data) */
    updateRunStatus(runId, status, errorMessage) {
        this.stmtUpdateRunStatus.run(status, errorMessage ?? null, runId);
    }
    /** Complete a run with final results */
    completeRun(runId, data) {
        this.stmtUpdateRunComplete.run(data.status, data.finishedAt, data.durationMs, data.tokensUsed ?? null, data.errorMessage ?? null, runId);
    }
    /** Get a currently running run for an App (if any) */
    getRunningRunForApp(appId) {
        const row = this.stmtGetRunningRunForApp.get(appId);
        return row ? rowToRun(row) : null;
    }
    /** Get the latest run for an App */
    getLatestRunForApp(appId) {
        const row = this.stmtGetLatestRunForApp.get(appId);
        return row ? rowToRun(row) : null;
    }
    // ── Entry Operations ──────────────────────────
    /** Insert an activity entry */
    insertEntry(entry) {
        this.stmtInsertEntry.run(entry.id, entry.appId, entry.runId, entry.type, entry.ts, entry.sessionKey ?? null, JSON.stringify(entry.content), entry.userResponse ? JSON.stringify(entry.userResponse) : null);
    }
    /** Get a single entry by ID */
    getEntry(entryId) {
        const row = this.stmtGetEntry.get(entryId);
        return row ? rowToEntry(row) : null;
    }
    /** Get entries for an App with optional filtering */
    getEntriesForApp(appId, options) {
        const limit = options?.limit ?? 50;
        const offset = options?.offset ?? 0;
        let rows;
        if (options?.type) {
            rows = this.stmtGetEntriesForAppWithType.all(appId, options.type, limit, offset);
        }
        else if (options?.since) {
            rows = this.stmtGetEntriesForAppSince.all(appId, options.since, limit, offset);
        }
        else {
            rows = this.stmtGetEntriesForApp.all(appId, limit, offset);
        }
        return rows.map(rowToEntry);
    }
    /** Update an entry with a user response (for escalation) */
    updateEntryResponse(entryId, response) {
        this.stmtUpdateEntryResponse.run(JSON.stringify(response), entryId);
    }
    /** Get a pending (unanswered) escalation entry */
    getPendingEscalation(appId, entryId) {
        const row = this.stmtGetPendingEscalation.get(appId, entryId);
        return row ? rowToEntry(row) : null;
    }
    /** Get all activity entries for a specific run */
    getEntriesForRun(runId) {
        const rows = this.stmtGetEntriesForRun.all(runId);
        return rows.map(rowToEntry);
    }
    /** Get all pending (unanswered) escalation entries across all apps, oldest first */
    getAllPendingEscalations() {
        const rows = this.stmtGetAllPendingEscalations.all();
        return rows.map(rowToEntry);
    }
    // ── Data Lifecycle ──────────────────────────
    /**
     * Remove old completed runs and their associated activity entries.
     *
     * Deletes runs (and cascade-deletes their entries) where:
     * - The run is finished (status != 'running' and status != 'waiting_user')
     * - The run's started_at is older than the retention cutoff
     *
     * @param retentionMs - Maximum age in milliseconds. Defaults to 1 year.
     * @returns Number of runs deleted (entries are cascade-deleted).
     */
    pruneOldData(retentionMs = DEFAULT_RETENTION_MS) {
        const cutoff = Date.now() - retentionMs;
        const result = this.db.prepare(`
      DELETE FROM automation_runs
      WHERE started_at < ?
        AND status NOT IN ('running', 'waiting_user')
    `).run(cutoff);
        return result.changes;
    }
}
//# sourceMappingURL=store.js.map