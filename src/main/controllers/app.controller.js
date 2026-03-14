/**
 * App Controller - Unified business logic for App import/export
 *
 * Used by both IPC handlers and HTTP routes to avoid duplicating
 * the spec serialization, validation, install, and activation logic.
 */
import { stringify as stringifyYaml } from 'yaml';
import { getAppManager } from '../apps/manager';
import { getAppRuntime } from '../apps/runtime';
import { parseAndValidateAppSpec, AppSpecValidationError } from '../apps/spec';
/**
 * Export an app's spec as a clean YAML string with a suggested filename.
 */
export function exportSpec(appId) {
    try {
        const manager = getAppManager();
        if (!manager) {
            return { success: false, error: 'App Manager is not yet initialized. Please try again shortly.', code: 'NOT_INITIALIZED' };
        }
        const app = manager.getApp(appId);
        if (!app) {
            return { success: false, error: `App not found: ${appId}`, code: 'NOT_FOUND' };
        }
        // Strip undefined/null fields for clean YAML output
        const clean = JSON.parse(JSON.stringify(app.spec));
        const yaml = stringifyYaml(clean, { lineWidth: 0 });
        // Derive a safe filename: "{name}-{version}.yaml"
        const slug = app.spec.name
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        const filename = `${slug}-${app.spec.version ?? '1.0'}.yaml`;
        return { success: true, data: { yaml, filename } };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Import an app from a YAML spec string: parse, validate, install, and auto-activate.
 *
 * Returns structured error codes so callers can map to appropriate HTTP status
 * codes without relying on error message string matching.
 */
export async function importSpec(input) {
    try {
        const manager = getAppManager();
        if (!manager) {
            return { success: false, error: 'App Manager is not yet initialized. Please try again shortly.', code: 'NOT_INITIALIZED' };
        }
        // Parse YAML and validate spec in one step
        let spec;
        try {
            spec = parseAndValidateAppSpec(input.yamlContent);
        }
        catch (parseErr) {
            const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
            if (parseErr instanceof AppSpecValidationError) {
                return { success: false, error: `Spec validation failed: ${msg}`, code: 'VALIDATION_FAILED' };
            }
            return { success: false, error: `Invalid YAML: ${msg}`, code: 'INVALID_YAML' };
        }
        const appId = await manager.install(input.spaceId, spec, input.userConfig);
        // Auto-activate in runtime if available
        const runtime = getAppRuntime();
        let activationWarning;
        if (runtime) {
            try {
                await runtime.activate(appId);
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                console.warn(`[AppController] importSpec: runtime activate failed (non-fatal): ${errMsg}`);
                activationWarning = errMsg;
            }
        }
        return { success: true, data: { appId, activationWarning } };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=app.controller.js.map