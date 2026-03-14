/**
 * Config Controller - Unified business logic for configuration
 * Used by both IPC handlers and HTTP routes
 */
import { getConfig as serviceGetConfig, saveConfig as serviceSaveConfig } from '../services/config.service';
import { validateApiConnection, fetchModelsFromApi } from '../services/api-validator.service';
/**
 * Get current configuration
 */
export function getConfig() {
    try {
        const config = serviceGetConfig();
        return { success: true, data: config };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Update configuration
 */
export function setConfig(updates) {
    try {
        const config = serviceSaveConfig(updates);
        return { success: true, data: config };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Validate API connection via SDK
 */
export async function validateApi(apiKey, apiUrl, provider, model) {
    try {
        const result = await validateApiConnection({
            apiKey,
            apiUrl,
            provider: provider,
            model
        });
        return {
            success: result.valid,
            data: {
                model: result.model,
                normalizedUrl: result.normalizedUrl
            },
            error: result.message
        };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Fetch available models from an OpenAI-compatible API endpoint
 */
export async function fetchModels(apiKey, apiUrl) {
    try {
        const result = await fetchModelsFromApi({ apiKey, apiUrl });
        return { success: true, data: result };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=config.controller.js.map