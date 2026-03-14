/**
 * apps/manager -- SQLite Store
 *
 * Low-level CRUD operations for the installed_apps table.
 * This module handles serialization/deserialization between the InstalledApp
 * domain type and the flat SQLite row format.
 *
 * All methods are synchronous (better-sqlite3 is a synchronous API).
 * The store does not enforce business rules -- that is the service layer's job.
 */
// ============================================
// Row <-> Domain Mapping
// ============================================
/**
 * Convert a database row to an InstalledApp domain object.
 */
function rowToInstalledApp(row) {
    return {
        id: row.id,
        specId: row.spec_id,
        spaceId: row.space_id,
        spec: JSON.parse(row.spec_json),
        status: row.status,
        pendingEscalationId: row.pending_escalation_id ?? undefined,
        userConfig: JSON.parse(row.user_config_json),
        userOverrides: JSON.parse(row.user_overrides_json),
        permissions: JSON.parse(row.permissions_json),
        installedAt: row.installed_at,
        lastRunAt: row.last_run_at ?? undefined,
        lastRunOutcome: row.last_run_outcome ?? undefined,
        errorMessage: row.error_message ?? undefined,
        uninstalledAt: row.uninstalled_at ?? undefined,
    };
}
// ============================================
// AppManagerStore
// ============================================
/**
 * Prepared-statement-based store for the installed_apps table.
 *
 * All statements are prepared once at construction time for performance.
 * The store is stateless beyond the prepared statements -- it does not cache
 * any data in memory.
 */
export class AppManagerStore {
    db;
    stmtInsert;
    stmtGetById;
    stmtDeleteById;
    stmtUpdateStatus;
    stmtUpdateConfig;
    stmtUpdateOverrides;
    stmtUpdatePermissions;
    stmtUpdateLastRun;
    stmtUpdateSpec;
    stmtListAll;
    stmtGetBySpecAndSpace;
    stmtUpdateUninstalledAt;
    constructor(db) {
        this.db = db;
        // ── INSERT ────────────────────────────────────
        this.stmtInsert = db.prepare(`
      INSERT INTO installed_apps (
        id, spec_id, space_id, spec_json, status,
        pending_escalation_id, user_config_json, user_overrides_json,
        permissions_json, installed_at, last_run_at, last_run_outcome, error_message
      ) VALUES (
        @id, @spec_id, @space_id, @spec_json, @status,
        @pending_escalation_id, @user_config_json, @user_overrides_json,
        @permissions_json, @installed_at, @last_run_at, @last_run_outcome, @error_message
      )
    `);
        // ── SELECT ────────────────────────────────────
        this.stmtGetById = db.prepare(`
      SELECT * FROM installed_apps WHERE id = ?
    `);
        this.stmtGetBySpecAndSpace = db.prepare(`
      SELECT * FROM installed_apps WHERE spec_id = ? AND space_id = ?
    `);
        this.stmtListAll = db.prepare(`
      SELECT * FROM installed_apps ORDER BY installed_at DESC
    `);
        // ── DELETE ────────────────────────────────────
        this.stmtDeleteById = db.prepare(`
      DELETE FROM installed_apps WHERE id = ?
    `);
        // ── UPDATE ────────────────────────────────────
        this.stmtUpdateStatus = db.prepare(`
      UPDATE installed_apps
      SET status = @status,
          pending_escalation_id = @pending_escalation_id,
          error_message = @error_message
      WHERE id = @id
    `);
        this.stmtUpdateConfig = db.prepare(`
      UPDATE installed_apps
      SET user_config_json = @user_config_json
      WHERE id = @id
    `);
        this.stmtUpdateOverrides = db.prepare(`
      UPDATE installed_apps
      SET user_overrides_json = @user_overrides_json
      WHERE id = @id
    `);
        this.stmtUpdatePermissions = db.prepare(`
      UPDATE installed_apps
      SET permissions_json = @permissions_json
      WHERE id = @id
    `);
        this.stmtUpdateLastRun = db.prepare(`
      UPDATE installed_apps
      SET last_run_at = @last_run_at,
          last_run_outcome = @last_run_outcome,
          error_message = @error_message
      WHERE id = @id
    `);
        this.stmtUpdateSpec = db.prepare(`
      UPDATE installed_apps
      SET spec_json = @spec_json,
          spec_id = @spec_id
      WHERE id = @id
    `);
        this.stmtUpdateUninstalledAt = db.prepare(`
      UPDATE installed_apps
      SET uninstalled_at = @uninstalled_at
      WHERE id = @id
    `);
    }
    // ── Create ─────────────────────────────────────
    /**
     * Insert a new installed App record.
     *
     * @throws If the UNIQUE(spec_id, space_id) constraint is violated.
     */
    insert(app) {
        this.stmtInsert.run({
            id: app.id,
            spec_id: app.specId,
            space_id: app.spaceId,
            spec_json: JSON.stringify(app.spec),
            status: app.status,
            pending_escalation_id: app.pendingEscalationId ?? null,
            user_config_json: JSON.stringify(app.userConfig),
            user_overrides_json: JSON.stringify(app.userOverrides),
            permissions_json: JSON.stringify(app.permissions),
            installed_at: app.installedAt,
            last_run_at: app.lastRunAt ?? null,
            last_run_outcome: app.lastRunOutcome ?? null,
            error_message: app.errorMessage ?? null,
        });
    }
    // ── Read ───────────────────────────────────────
    /**
     * Get an installed App by its unique ID.
     * Returns null if not found.
     */
    getById(appId) {
        const row = this.stmtGetById.get(appId);
        return row ? rowToInstalledApp(row) : null;
    }
    /**
     * Check if an App with the given specId is already installed in the space.
     * Returns the existing InstalledApp if found, null otherwise.
     */
    getBySpecAndSpace(specId, spaceId) {
        const row = this.stmtGetBySpecAndSpace.get(specId, spaceId);
        return row ? rowToInstalledApp(row) : null;
    }
    /**
     * List all installed Apps, optionally filtered.
     *
     * Filtering is done in-memory after fetching all rows. For the expected
     * scale (tens to low hundreds of installed Apps), this is perfectly adequate
     * and simpler than dynamic SQL construction.
     */
    list(filter) {
        const rows = this.stmtListAll.all();
        let apps = rows.map(rowToInstalledApp);
        if (filter) {
            if (filter.spaceId) {
                const spaceId = filter.spaceId;
                apps = apps.filter(a => a.spaceId === spaceId);
            }
            if (filter.status) {
                const status = filter.status;
                apps = apps.filter(a => a.status === status);
            }
            if (filter.type) {
                const type = filter.type;
                apps = apps.filter(a => a.spec.type === type);
            }
        }
        return apps;
    }
    // ── Update ─────────────────────────────────────
    /**
     * Update the status and related fields of an installed App.
     */
    updateStatus(appId, status, pendingEscalationId, errorMessage) {
        this.stmtUpdateStatus.run({
            id: appId,
            status,
            pending_escalation_id: pendingEscalationId,
            error_message: errorMessage,
        });
    }
    /**
     * Update the user configuration JSON for an App.
     */
    updateConfig(appId, config) {
        this.stmtUpdateConfig.run({
            id: appId,
            user_config_json: JSON.stringify(config),
        });
    }
    /**
     * Update the user overrides JSON for an App.
     */
    updateOverrides(appId, overrides) {
        this.stmtUpdateOverrides.run({
            id: appId,
            user_overrides_json: JSON.stringify(overrides),
        });
    }
    /**
     * Update the permissions JSON for an App.
     */
    updatePermissions(appId, permissions) {
        this.stmtUpdatePermissions.run({
            id: appId,
            permissions_json: JSON.stringify(permissions),
        });
    }
    /**
     * Update the App spec and spec_id for an installed App.
     */
    updateSpec(appId, spec) {
        this.stmtUpdateSpec.run({
            id: appId,
            spec_json: JSON.stringify(spec),
            spec_id: spec.name,
        });
    }
    /**
     * Record the result of a run execution.
     */
    updateLastRun(appId, lastRunAt, outcome, errorMessage) {
        this.stmtUpdateLastRun.run({
            id: appId,
            last_run_at: lastRunAt,
            last_run_outcome: outcome,
            error_message: errorMessage,
        });
    }
    /**
     * Update the uninstalled_at timestamp for an App.
     * Pass a timestamp (ms) for soft-delete, or null to clear (reinstall).
     */
    updateUninstalledAt(appId, ts) {
        this.stmtUpdateUninstalledAt.run({
            id: appId,
            uninstalled_at: ts,
        });
    }
    // ── Delete ─────────────────────────────────────
    /**
     * Delete an installed App record by ID.
     * Returns true if a row was actually deleted, false if it did not exist.
     */
    delete(appId) {
        const result = this.stmtDeleteById.run(appId);
        return result.changes > 0;
    }
}
//# sourceMappingURL=store.js.map