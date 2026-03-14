/**
 * Shared App Runtime Types
 *
 * Pure TypeScript type definitions for the Apps system.
 * These types are used by both the main process and the renderer process.
 *
 * IMPORTANT: This file must NOT import any Node.js or Electron APIs.
 * It is included in the renderer (web) tsconfig.
 *
 * All types here are manually mirrored from:
 *   - src/main/apps/manager/types.ts  (AppStatus, RunOutcome, InstalledApp)
 *   - src/main/apps/runtime/types.ts  (ActivityEntry, AutomationAppState, EscalationResponse, etc.)
 *
 * Why manual mirror instead of re-export?
 * - The renderer tsconfig does not include src/main/
 * - Importing from src/main/ would pull in Node.js types and Zod schemas
 * - Keeps the renderer bundle free of server-only code
 *
 * When the source types change, update this file to match.
 */
// ============================================
// Permission Helpers
// ============================================
/**
 * Resolve whether a specific permission is effective for an App.
 *
 * Resolution order (user override wins over spec declaration):
 * 1. If explicitly denied  → false
 * 2. If explicitly granted → true
 * 3. Fall back to spec.permissions (default: true for ai-browser)
 *
 * The default-true fallback for 'ai-browser' ensures that most automation Apps
 * (which rely on browser capabilities) work out of the box. Users or spec authors
 * can opt out by adding 'ai-browser' to the denied list or omitting it from
 * spec.permissions respectively.
 */
export function resolvePermission(app, permission, defaultValue = true) {
    if (app.permissions.denied.includes(permission))
        return false;
    if (app.permissions.granted.includes(permission))
        return true;
    // Fall back to spec declaration, then to the provided default
    return app.spec.permissions?.includes(permission) ?? defaultValue;
}
//# sourceMappingURL=app-types.js.map