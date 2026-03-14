/**
 * apps/manager -- Service Implementation
 *
 * Implements the AppManagerService interface with:
 * - State machine enforcement for status transitions
 * - Work directory creation on install
 * - Event notification on status changes
 * - Delegation to AppManagerStore for persistence
 *
 * This is the single implementation class. It is created by initAppManager()
 * in index.ts and returned as the AppManagerService interface.
 */
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { validateAppSpec } from '../spec';
import { AppNotFoundError, AppAlreadyInstalledError, InvalidStatusTransitionError, SpaceNotFoundError, } from './errors';
// ============================================
// State Machine
// ============================================
/**
 * Defines which status transitions are legal.
 *
 * Key: current status
 * Value: set of statuses that can be transitioned TO
 */
const VALID_TRANSITIONS = {
    active: new Set(['paused', 'error', 'needs_login', 'waiting_user', 'uninstalled']),
    paused: new Set(['active', 'uninstalled']),
    error: new Set(['active', 'paused', 'uninstalled']),
    needs_login: new Set(['active', 'paused', 'uninstalled']),
    waiting_user: new Set(['active', 'paused', 'error', 'uninstalled']),
    uninstalled: new Set(['active']),
};
/**
 * Check if a status transition is legal according to the state machine.
 */
function isValidTransition(from, to) {
    return VALID_TRANSITIONS[from]?.has(to) ?? false;
}
/**
 * Create the AppManagerService implementation.
 *
 * @param deps - Injected dependencies
 * @returns A fully functional AppManagerService
 */
export function createAppManagerService(deps) {
    const { store, getSpacePath } = deps;
    // Status change event listeners
    const statusChangeHandlers = [];
    /**
     * Notify all registered status change handlers.
     * Errors in handlers are caught and logged (do not propagate).
     */
    function notifyStatusChange(appId, oldStatus, newStatus) {
        for (const handler of statusChangeHandlers) {
            try {
                handler(appId, oldStatus, newStatus);
            }
            catch (error) {
                console.error('[AppManager] Status change handler error:', error);
            }
        }
    }
    /**
     * Get an App or throw if not found.
     * Internal helper used by most methods.
     */
    function requireApp(appId) {
        const app = store.getById(appId);
        if (!app) {
            throw new AppNotFoundError(appId);
        }
        return app;
    }
    /**
     * Resolve the work directory path for an App.
     * Format: {spacePath}/.halo/apps/{appId}/
     */
    function resolveWorkDir(spacePath, appId) {
        return join(spacePath, '.halo', 'apps', appId);
    }
    /**
     * Ensure a directory exists, creating it recursively if needed.
     */
    function ensureDir(dirPath) {
        if (!existsSync(dirPath)) {
            mkdirSync(dirPath, { recursive: true });
        }
    }
    // ── Service Interface Implementation ─────────
    const service = {
        // ── Installation ──────────────────────────
        async install(spaceId, spec, userConfig) {
            // Validate space exists
            const spacePath = getSpacePath(spaceId);
            if (!spacePath) {
                throw new SpaceNotFoundError(spaceId);
            }
            // Validate spec before any DB operations
            validateAppSpec(spec);
            // Check for duplicate installation
            const specId = spec.name; // Use spec name as the canonical spec identifier
            const existing = store.getBySpecAndSpace(specId, spaceId);
            if (existing) {
                throw new AppAlreadyInstalledError(specId, spaceId);
            }
            // Generate unique ID
            const appId = uuidv4();
            // Build the InstalledApp record
            const app = {
                id: appId,
                specId,
                spaceId,
                spec,
                status: 'active',
                userConfig: userConfig ?? {},
                userOverrides: {},
                permissions: {
                    granted: [],
                    denied: [],
                },
                installedAt: Date.now(),
            };
            // Persist to SQLite first (atomic: if this fails, no filesystem side effects).
            // Catch UNIQUE constraint violations from concurrent installs and convert to
            // the domain error, so callers receive AppAlreadyInstalledError regardless of
            // whether the duplicate was detected by the pre-check or by the DB constraint.
            try {
                store.insert(app);
            }
            catch (dbError) {
                const sqliteCode = dbError?.code;
                if (sqliteCode === 'SQLITE_CONSTRAINT_UNIQUE' || sqliteCode === 'SQLITE_CONSTRAINT') {
                    throw new AppAlreadyInstalledError(specId, spaceId);
                }
                throw dbError;
            }
            // Create work directories after the DB record is committed.
            // If directory creation fails, roll back the DB record to avoid orphaned rows.
            const workDir = resolveWorkDir(spacePath, appId);
            const memoryDir = join(workDir, 'memory');
            try {
                ensureDir(workDir);
                ensureDir(memoryDir);
            }
            catch (dirError) {
                // Roll back the DB record to keep the install atomic
                try {
                    store.delete(appId);
                }
                catch { /* best-effort rollback */ }
                throw dirError;
            }
            console.log(`[AppManager] Installed app '${spec.name}' (${appId}) in space ${spaceId}`);
            return appId;
        },
        async uninstall(appId, _options) {
            const app = requireApp(appId);
            // Soft-delete: transition to 'uninstalled' status and record timestamp
            const oldStatus = app.status;
            const newStatus = 'uninstalled';
            if (!isValidTransition(oldStatus, newStatus)) {
                throw new InvalidStatusTransitionError(appId, oldStatus, newStatus);
            }
            store.updateStatus(appId, newStatus, null, null);
            store.updateUninstalledAt(appId, Date.now());
            notifyStatusChange(appId, oldStatus, newStatus);
            console.log(`[AppManager] Soft-deleted app ${appId} (was: ${oldStatus})`);
        },
        reinstall(appId) {
            const app = requireApp(appId);
            const oldStatus = app.status;
            const newStatus = 'active';
            if (oldStatus !== 'uninstalled') {
                throw new InvalidStatusTransitionError(appId, oldStatus, newStatus);
            }
            store.updateStatus(appId, newStatus, null, null);
            store.updateUninstalledAt(appId, null);
            notifyStatusChange(appId, oldStatus, newStatus);
            console.log(`[AppManager] Reinstalled app ${appId}`);
        },
        async deleteApp(appId) {
            const app = requireApp(appId);
            if (app.status !== 'uninstalled') {
                throw new InvalidStatusTransitionError(appId, app.status, 'uninstalled', 'App must be uninstalled before permanent deletion');
            }
            // Hard-delete the database record
            store.delete(appId);
            // Purge the work directory
            const spacePath = getSpacePath(app.spaceId);
            if (spacePath) {
                const workDir = resolveWorkDir(spacePath, appId);
                if (existsSync(workDir)) {
                    try {
                        rmSync(workDir, { recursive: true, force: true });
                        console.log(`[AppManager] Purged work directory: ${workDir}`);
                    }
                    catch (error) {
                        console.error(`[AppManager] Failed to purge work directory ${workDir}:`, error);
                    }
                }
            }
            console.log(`[AppManager] Permanently deleted app ${appId}`);
        },
        // ── Status Management ─────────────────────
        pause(appId) {
            const app = requireApp(appId);
            const oldStatus = app.status;
            const newStatus = 'paused';
            if (!isValidTransition(oldStatus, newStatus)) {
                throw new InvalidStatusTransitionError(appId, oldStatus, newStatus);
            }
            store.updateStatus(appId, newStatus, null, null);
            notifyStatusChange(appId, oldStatus, newStatus);
            console.log(`[AppManager] App ${appId}: ${oldStatus} -> ${newStatus}`);
        },
        resume(appId) {
            const app = requireApp(appId);
            const oldStatus = app.status;
            const newStatus = 'active';
            if (!isValidTransition(oldStatus, newStatus)) {
                throw new InvalidStatusTransitionError(appId, oldStatus, newStatus);
            }
            // Clear error-related fields on resume
            store.updateStatus(appId, newStatus, null, null);
            notifyStatusChange(appId, oldStatus, newStatus);
            console.log(`[AppManager] App ${appId}: ${oldStatus} -> ${newStatus}`);
        },
        updateStatus(appId, status, extra) {
            const app = requireApp(appId);
            const oldStatus = app.status;
            if (oldStatus === status) {
                // No-op: already in the target status.
                // Still update extra fields if provided.
                store.updateStatus(appId, status, extra?.pendingEscalationId ?? app.pendingEscalationId ?? null, extra?.errorMessage ?? app.errorMessage ?? null);
                return;
            }
            if (!isValidTransition(oldStatus, status)) {
                throw new InvalidStatusTransitionError(appId, oldStatus, status);
            }
            store.updateStatus(appId, status, extra?.pendingEscalationId ?? null, extra?.errorMessage ?? null);
            notifyStatusChange(appId, oldStatus, status);
            console.log(`[AppManager] App ${appId}: ${oldStatus} -> ${status}`);
        },
        // ── Configuration ─────────────────────────
        updateConfig(appId, config) {
            requireApp(appId); // Throws if not found
            store.updateConfig(appId, config);
        },
        updateFrequency(appId, subscriptionId, frequency) {
            const app = requireApp(appId);
            const overrides = { ...app.userOverrides };
            if (!overrides.frequency) {
                overrides.frequency = {};
            }
            overrides.frequency[subscriptionId] = frequency;
            store.updateOverrides(appId, overrides);
        },
        updateOverrides(appId, partial) {
            const app = requireApp(appId);
            const merged = { ...app.userOverrides, ...partial };
            store.updateOverrides(appId, merged);
        },
        updateSpec(appId, specPatch) {
            const app = requireApp(appId);
            // JSON Merge Patch: merge top-level fields, null = delete
            const currentSpec = app.spec;
            const merged = { ...currentSpec };
            for (const [key, value] of Object.entries(specPatch)) {
                if (value === null) {
                    delete merged[key];
                }
                else {
                    merged[key] = value;
                }
            }
            // Re-validate the merged spec through Zod
            const validatedSpec = validateAppSpec(merged);
            // Persist
            store.updateSpec(appId, validatedSpec);
            console.log(`[AppManager] Updated spec for app ${appId}`);
        },
        // ── Run Tracking ──────────────────────────
        updateLastRun(appId, outcome, errorMessage) {
            requireApp(appId); // Throws if not found
            store.updateLastRun(appId, Date.now(), outcome, errorMessage ?? null);
        },
        // ── Queries ───────────────────────────────
        getApp(appId) {
            return store.getById(appId);
        },
        listApps(filter) {
            return store.list(filter);
        },
        // ── Permissions ───────────────────────────
        grantPermission(appId, permission) {
            const app = requireApp(appId);
            const permissions = { ...app.permissions };
            // Add to granted if not already there
            if (!permissions.granted.includes(permission)) {
                permissions.granted = [...permissions.granted, permission];
            }
            // Remove from denied if present
            permissions.denied = permissions.denied.filter(p => p !== permission);
            store.updatePermissions(appId, permissions);
        },
        revokePermission(appId, permission) {
            const app = requireApp(appId);
            const permissions = { ...app.permissions };
            // Remove from granted
            permissions.granted = permissions.granted.filter(p => p !== permission);
            // Add to denied if not already there
            if (!permissions.denied.includes(permission)) {
                permissions.denied = [...permissions.denied, permission];
            }
            store.updatePermissions(appId, permissions);
        },
        // ── File System ───────────────────────────
        getAppWorkDir(appId) {
            const app = requireApp(appId);
            const spacePath = getSpacePath(app.spaceId);
            if (!spacePath) {
                throw new SpaceNotFoundError(app.spaceId);
            }
            const workDir = resolveWorkDir(spacePath, appId);
            // Auto-create if missing (contract: returned path always exists)
            ensureDir(workDir);
            // Also ensure the memory subdirectory exists
            ensureDir(join(workDir, 'memory'));
            return workDir;
        },
        // ── Events ────────────────────────────────
        onAppStatusChange(handler) {
            statusChangeHandlers.push(handler);
            return () => {
                const index = statusChangeHandlers.indexOf(handler);
                if (index > -1) {
                    statusChangeHandlers.splice(index, 1);
                }
            };
        },
    };
    return service;
}
//# sourceMappingURL=service.js.map