/**
 * Config Probe - Configuration file health check
 *
 * Checks:
 * - Config file exists
 * - JSON is valid
 * - Critical fields are present
 * - API key is configured
 */
import { existsSync, readFileSync } from 'fs';
import { getConfigPath } from '../../../config.service';
/**
 * Check configuration file health
 */
export async function runConfigProbe() {
    const configPath = getConfigPath();
    const errors = [];
    let fileExists = false;
    let jsonValid = false;
    let criticalFieldsPresent = false;
    let apiKeyConfigured = false;
    try {
        // Check file exists
        fileExists = existsSync(configPath);
        if (!fileExists) {
            return {
                name: 'config',
                healthy: false,
                severity: 'info', // Missing config is OK on first launch
                message: 'Config file not found, will be created on first launch',
                timestamp: Date.now(),
                data: {
                    fileExists,
                    jsonValid,
                    criticalFieldsPresent,
                    apiKeyConfigured,
                    errors: ['Config file does not exist']
                }
            };
        }
        // Try to parse JSON
        let config;
        try {
            const content = readFileSync(configPath, 'utf-8');
            config = JSON.parse(content);
            jsonValid = true;
        }
        catch (parseError) {
            errors.push(`JSON parse error: ${parseError.message}`);
            return {
                name: 'config',
                healthy: false,
                severity: 'critical',
                message: 'Config file is corrupted (invalid JSON)',
                timestamp: Date.now(),
                data: {
                    fileExists,
                    jsonValid,
                    criticalFieldsPresent,
                    apiKeyConfigured,
                    errors
                }
            };
        }
        // Check critical fields
        const aiSources = config.aiSources;
        const hasPermissions = config.permissions && typeof config.permissions === 'object';
        // Support both v1 (aiSources.current) and v2 (aiSources.currentId) formats
        const isV2 = aiSources?.version === 2;
        const hasAiSourcesCurrent = isV2
            ? (aiSources?.currentId !== undefined) // v2: currentId can be null or string
            : (aiSources && typeof aiSources.current === 'string'); // v1: current is string
        criticalFieldsPresent = !!(hasAiSourcesCurrent && hasPermissions);
        if (!hasAiSourcesCurrent) {
            errors.push(isV2 ? 'Missing aiSources.currentId field' : 'Missing aiSources.current field');
        }
        if (!hasPermissions) {
            errors.push('Missing permissions field');
        }
        // Check API key configuration
        if (isV2) {
            // v2 format: check sources array
            const sources = aiSources?.sources;
            const currentId = aiSources?.currentId;
            const currentSource = sources?.find(s => s.id === currentId);
            if (currentSource) {
                const authType = currentSource.authType;
                if (authType === 'api-key') {
                    apiKeyConfigured = !!(currentSource.apiKey && typeof currentSource.apiKey === 'string' && currentSource.apiKey.length > 0);
                }
                else if (authType === 'oauth') {
                    apiKeyConfigured = !!(currentSource.accessToken && typeof currentSource.accessToken === 'string');
                }
            }
        }
        else {
            // v1 format: legacy check
            const currentSource = aiSources?.current;
            if (currentSource === 'custom') {
                const custom = aiSources?.custom;
                apiKeyConfigured = !!(custom?.apiKey && typeof custom.apiKey === 'string' && custom.apiKey.length > 0);
            }
            else if (currentSource && currentSource !== 'custom') {
                // OAuth provider - check for access token
                const provider = aiSources?.[currentSource];
                apiKeyConfigured = !!(provider?.accessToken && typeof provider.accessToken === 'string');
            }
        }
        // Determine overall health
        const healthy = jsonValid && criticalFieldsPresent;
        const severity = !healthy ? 'critical' : !apiKeyConfigured ? 'warning' : 'info';
        let message = 'Config file is healthy';
        if (!criticalFieldsPresent) {
            message = 'Config file missing critical fields';
        }
        else if (!apiKeyConfigured) {
            message = 'No API key configured';
        }
        return {
            name: 'config',
            healthy,
            severity,
            message,
            timestamp: Date.now(),
            data: {
                fileExists,
                jsonValid,
                criticalFieldsPresent,
                apiKeyConfigured,
                errors
            }
        };
    }
    catch (error) {
        errors.push(`Unexpected error: ${error.message}`);
        return {
            name: 'config',
            healthy: false,
            severity: 'critical',
            message: `Config check failed: ${error.message}`,
            timestamp: Date.now(),
            data: {
                fileExists,
                jsonValid,
                criticalFieldsPresent,
                apiKeyConfigured,
                errors
            }
        };
    }
}
//# sourceMappingURL=config-probe.js.map