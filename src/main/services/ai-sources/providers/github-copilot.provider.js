/**
 * GitHub Copilot OAuth Provider
 *
 * Implements OAuth Device Code Flow for GitHub Copilot authentication.
 * Uses the same OAuth flow as VSCode and other Copilot clients.
 *
 * Authentication Flow:
 * 1. Request device code from GitHub
 * 2. User authorizes in browser
 * 3. Poll for access token
 * 4. Exchange GitHub token for Copilot token
 * 5. Use Copilot token for API calls
 */
import { shell } from 'electron';
// ============================================================================
// Constants
// ============================================================================
/**
 * GitHub OAuth App Client ID for Copilot
 * This is the same Client ID used by VSCode and other official Copilot clients
 */
const GITHUB_CLIENT_ID = 'Iv1.b507a08c87ecfe98';
/**
 * GitHub OAuth endpoints
 */
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
/**
 * Copilot API endpoints
 */
const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_API_URL = 'https://api.githubcopilot.com';
const COPILOT_MODELS_URL = 'https://api.githubcopilot.com/models';
/**
 * OAuth scopes required for Copilot
 */
const GITHUB_SCOPES = 'read:user';
/**
 * Polling configuration
 */
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 300000; // 5 minutes
/**
 * Copilot token refresh threshold (refresh when less than 5 minutes remaining)
 */
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
let pendingAuth = null;
let cachedCopilotToken = null;
// ============================================================================
// GitHub Copilot Provider Implementation
// ============================================================================
class GitHubCopilotProvider {
    type = 'github-copilot';
    displayName = 'GitHub Copilot';
    /**
     * Check if GitHub Copilot is configured
     */
    isConfigured(config) {
        const copilotConfig = config['github-copilot'];
        return !!(copilotConfig?.loggedIn && copilotConfig?.accessToken);
    }
    /**
     * Get backend configuration for API calls
     */
    getBackendConfig(config) {
        const copilotConfig = config['github-copilot'];
        if (!copilotConfig?.loggedIn || !copilotConfig?.accessToken) {
            return null;
        }
        // Use cached Copilot token if available and valid
        // The Copilot token should be pre-fetched by ensureCopilotTokenCached (called from ensureValidToken)
        const apiToken = (cachedCopilotToken && cachedCopilotToken.expiresAt > Date.now())
            ? cachedCopilotToken.token
            : copilotConfig.accessToken;
        // Use API endpoint from token response, fallback to default
        const apiBase = cachedCopilotToken?.apiEndpoint || COPILOT_API_URL;
        if (!cachedCopilotToken || cachedCopilotToken.expiresAt <= Date.now()) {
            console.warn('[GitHubCopilot] No valid cached Copilot token, API call may fail');
        }
        console.log('[GitHubCopilot] Using API endpoint:', apiBase);
        return {
            url: `${apiBase}/chat/completions`,
            key: apiToken,
            model: copilotConfig.model || 'gpt-4o',
            headers: {
                'Editor-Version': 'vscode/1.85.0',
                'Editor-Plugin-Version': 'copilot/1.0.0',
                'Copilot-Integration-Id': 'vscode-chat',
                'Openai-Intent': 'conversation-panel'
            },
            apiType: 'chat_completions'
        };
    }
    /**
     * Get current model
     */
    getCurrentModel(config) {
        const copilotConfig = config['github-copilot'];
        return copilotConfig?.model || null;
    }
    /**
     * Get available models from Copilot API
     */
    async getAvailableModels(config) {
        const copilotConfig = config['github-copilot'];
        if (!copilotConfig?.accessToken) {
            return this.getDefaultModels();
        }
        try {
            // Get Copilot token first
            const copilotToken = await this.getCopilotToken(copilotConfig.accessToken);
            if (!copilotToken) {
                return copilotConfig.availableModels || this.getDefaultModels();
            }
            // Fetch models from Copilot API
            const response = await fetch(COPILOT_MODELS_URL, {
                headers: {
                    'Authorization': `Bearer ${copilotToken}`,
                    'Editor-Version': 'vscode/1.85.0',
                    'Editor-Plugin-Version': 'copilot/1.0.0'
                }
            });
            if (!response.ok) {
                console.warn('[GitHubCopilot] Failed to fetch models:', response.status);
                return copilotConfig.availableModels || this.getDefaultModels();
            }
            const data = await response.json();
            // Handle both { models: [...] } and { data: [...] } response formats
            const models = data.models || data.data || [];
            if (!Array.isArray(models) || models.length === 0) {
                console.warn('[GitHubCopilot] No models in response, using cached or defaults');
                return copilotConfig.availableModels || this.getDefaultModels();
            }
            return models.map((m) => m.id);
        }
        catch (error) {
            console.error('[GitHubCopilot] Error fetching models:', error);
            return copilotConfig.availableModels || this.getDefaultModels();
        }
    }
    /**
     * Default models when API is unavailable
     * These are common Copilot models as fallback - real models come from API
     */
    getDefaultModels() {
        // Fallback models based on commonly available Copilot models
        // The real list should be fetched from the API
        return [];
    }
    /**
     * Get user info from config
     */
    getUserInfo(config) {
        const copilotConfig = config['github-copilot'];
        return copilotConfig?.user || null;
    }
    // ========== OAuth Flow ==========
    /**
     * Start OAuth login flow
     */
    async startLogin() {
        try {
            console.log('[GitHubCopilot] Starting device code flow');
            // Request device code
            const response = await fetch(GITHUB_DEVICE_CODE_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: GITHUB_CLIENT_ID,
                    scope: GITHUB_SCOPES
                })
            });
            if (!response.ok) {
                throw new Error(`Failed to request device code: ${response.status}`);
            }
            const data = await response.json();
            // Store pending auth state
            pendingAuth = {
                deviceCode: data.device_code,
                userCode: data.user_code,
                verificationUri: data.verification_uri,
                expiresAt: Date.now() + data.expires_in * 1000,
                interval: Math.max(data.interval, 5) // At least 5 seconds
            };
            // Open browser to verification URL
            const loginUrl = `${data.verification_uri}?user_code=${data.user_code}`;
            await shell.openExternal(loginUrl);
            console.log('[GitHubCopilot] Device code flow started, user code:', data.user_code);
            return {
                success: true,
                data: {
                    loginUrl,
                    state: data.user_code,
                    userCode: data.user_code,
                    verificationUri: data.verification_uri
                }
            };
        }
        catch (error) {
            console.error('[GitHubCopilot] Start login error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to start login'
            };
        }
    }
    /**
     * Complete OAuth login by polling for token
     */
    async completeLogin(state) {
        if (!pendingAuth || pendingAuth.userCode !== state) {
            return {
                success: false,
                error: 'No pending authentication or state mismatch'
            };
        }
        try {
            console.log('[GitHubCopilot] Polling for authorization...');
            const startTime = Date.now();
            while (Date.now() - startTime < POLL_TIMEOUT_MS) {
                // Check if expired
                if (Date.now() > pendingAuth.expiresAt) {
                    pendingAuth = null;
                    return {
                        success: false,
                        error: 'Device code expired'
                    };
                }
                // Poll for token
                const response = await fetch(GITHUB_ACCESS_TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        client_id: GITHUB_CLIENT_ID,
                        device_code: pendingAuth.deviceCode,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
                    })
                });
                const data = await response.json();
                if (data.access_token) {
                    // Success! Clear pending state
                    const githubToken = data.access_token;
                    pendingAuth = null;
                    console.log('[GitHubCopilot] Got GitHub token, fetching user info...');
                    // Get user info
                    const user = await this.fetchGitHubUser(githubToken);
                    // Get Copilot token to verify access
                    const copilotToken = await this.getCopilotToken(githubToken);
                    if (!copilotToken) {
                        return {
                            success: false,
                            error: 'Could not get Copilot token. Make sure you have an active Copilot subscription.'
                        };
                    }
                    // Fetch available models
                    const models = await this.fetchModelsWithToken(copilotToken);
                    console.log('[GitHubCopilot] Login successful for user:', user?.login);
                    // Return with internal token data
                    const result = {
                        success: true,
                        user: {
                            name: user?.name || user?.login || 'GitHub User',
                            avatar: user?.avatar_url,
                            uid: user?.login || ''
                        },
                        _tokenData: {
                            accessToken: githubToken,
                            refreshToken: githubToken, // GitHub tokens don't have refresh tokens in device flow
                            expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // GitHub tokens don't expire
                            uid: user?.login || ''
                        },
                        _availableModels: models,
                        _modelNames: this.getModelDisplayNames(models),
                        _defaultModel: models.includes('gpt-4o') ? 'gpt-4o' : models[0] || 'gpt-4o'
                    };
                    return { success: true, data: result };
                }
                if (data.error === 'authorization_pending') {
                    // Still waiting, continue polling
                    await new Promise(resolve => setTimeout(resolve, pendingAuth.interval * 1000));
                    continue;
                }
                if (data.error === 'slow_down') {
                    // Increase interval
                    pendingAuth.interval += 5;
                    await new Promise(resolve => setTimeout(resolve, pendingAuth.interval * 1000));
                    continue;
                }
                if (data.error === 'expired_token') {
                    pendingAuth = null;
                    return {
                        success: false,
                        error: 'Device code expired. Please try again.'
                    };
                }
                if (data.error === 'access_denied') {
                    pendingAuth = null;
                    return {
                        success: false,
                        error: 'Access denied. User cancelled the authorization.'
                    };
                }
                // Unknown error
                pendingAuth = null;
                return {
                    success: false,
                    error: data.error_description || data.error || 'Unknown error'
                };
            }
            pendingAuth = null;
            return {
                success: false,
                error: 'Timeout waiting for authorization'
            };
        }
        catch (error) {
            console.error('[GitHubCopilot] Complete login error:', error);
            pendingAuth = null;
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to complete login'
            };
        }
    }
    /**
     * Refresh token (GitHub tokens don't expire, but Copilot tokens do)
     */
    async refreshToken() {
        // GitHub tokens from device flow don't expire
        // Copilot tokens are refreshed automatically when needed
        return { success: true };
    }
    /**
     * Check if token is valid
     */
    async checkToken() {
        // GitHub tokens are long-lived, but we should verify Copilot access
        return { success: true, data: { valid: true } };
    }
    /**
     * Logout
     */
    async logout() {
        cachedCopilotToken = null;
        pendingAuth = null;
        return { success: true };
    }
    // ========== Token Management ==========
    /**
     * Ensure Copilot token is cached (call this before getBackendConfig)
     * This is async and should be called from ensureValidToken
     */
    async ensureCopilotTokenCached(config) {
        const copilotConfig = config['github-copilot'];
        if (!copilotConfig?.accessToken) {
            return false;
        }
        // Check if we have a valid cached token
        if (cachedCopilotToken && cachedCopilotToken.expiresAt > Date.now() + TOKEN_REFRESH_THRESHOLD_MS) {
            return true;
        }
        // Fetch new Copilot token
        const copilotToken = await this.getCopilotToken(copilotConfig.accessToken);
        return !!copilotToken;
    }
    /**
     * Check token validity with config (called by manager)
     */
    checkTokenWithConfig(config) {
        const copilotConfig = config['github-copilot'];
        if (!copilotConfig?.accessToken) {
            return { valid: false, needsRefresh: false };
        }
        // Check if Copilot token needs refresh
        const needsRefresh = !cachedCopilotToken ||
            cachedCopilotToken.expiresAt <= Date.now() + TOKEN_REFRESH_THRESHOLD_MS;
        return { valid: true, needsRefresh };
    }
    /**
     * Refresh token with config (if needed)
     * This is called by the manager when checkTokenWithConfig returns needsRefresh: true
     */
    async refreshTokenWithConfig(config) {
        const copilotConfig = config['github-copilot'];
        if (!copilotConfig?.accessToken) {
            return { success: false, error: 'No token to refresh' };
        }
        // Refresh the Copilot token (this updates the cache)
        const success = await this.ensureCopilotTokenCached(config);
        if (!success) {
            return { success: false, error: 'Failed to refresh Copilot token' };
        }
        // GitHub tokens don't expire, return the current token
        // The Copilot token is now cached and will be used by getBackendConfig
        return {
            success: true,
            data: {
                accessToken: copilotConfig.accessToken,
                refreshToken: copilotConfig.refreshToken || copilotConfig.accessToken,
                expiresAt: copilotConfig.tokenExpires || Date.now() + 365 * 24 * 60 * 60 * 1000
            }
        };
    }
    /**
     * Refresh config (fetch updated models)
     */
    async refreshConfig(config) {
        const copilotConfig = config['github-copilot'];
        if (!copilotConfig?.accessToken) {
            return { success: false, error: 'Not logged in' };
        }
        try {
            const models = await this.getAvailableModels(config);
            return {
                success: true,
                data: {
                    'github-copilot': {
                        ...copilotConfig,
                        availableModels: models,
                        modelNames: this.getModelDisplayNames(models)
                    }
                }
            };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    // ========== Helper Methods ==========
    /**
     * Fetch GitHub user info
     */
    async fetchGitHubUser(token) {
        try {
            const response = await fetch(GITHUB_USER_URL, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });
            if (!response.ok) {
                console.warn('[GitHubCopilot] Failed to fetch user:', response.status);
                return null;
            }
            return await response.json();
        }
        catch (error) {
            console.error('[GitHubCopilot] Error fetching user:', error);
            return null;
        }
    }
    /**
     * Get Copilot token from GitHub token
     * Copilot tokens are short-lived (~30 minutes) and need to be refreshed
     */
    async getCopilotToken(githubToken) {
        // Check cache
        if (cachedCopilotToken && cachedCopilotToken.expiresAt > Date.now() + TOKEN_REFRESH_THRESHOLD_MS) {
            return cachedCopilotToken.token;
        }
        try {
            const response = await fetch(COPILOT_TOKEN_URL, {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/json',
                    'Editor-Version': 'vscode/1.85.0',
                    'Editor-Plugin-Version': 'copilot/1.0.0'
                }
            });
            if (!response.ok) {
                console.warn('[GitHubCopilot] Failed to get Copilot token:', response.status);
                return null;
            }
            const data = await response.json();
            if (data.error_details) {
                console.warn('[GitHubCopilot] Copilot token error:', data.error_details.message);
                return null;
            }
            console.log('[GitHubCopilot] Copilot token received, API endpoint:', data.endpoints?.api);
            // Cache the token with API endpoint
            cachedCopilotToken = {
                token: data.token,
                expiresAt: data.expires_at * 1000, // Convert to milliseconds
                apiEndpoint: data.endpoints?.api
            };
            return data.token;
        }
        catch (error) {
            console.error('[GitHubCopilot] Error getting Copilot token:', error);
            return null;
        }
    }
    /**
     * Fetch models with Copilot token
     */
    async fetchModelsWithToken(copilotToken) {
        try {
            console.log('[GitHubCopilot] Fetching models from:', COPILOT_MODELS_URL);
            const response = await fetch(COPILOT_MODELS_URL, {
                headers: {
                    'Authorization': `Bearer ${copilotToken}`,
                    'Editor-Version': 'vscode/1.85.0',
                    'Editor-Plugin-Version': 'copilot/1.0.0'
                }
            });
            if (!response.ok) {
                console.warn('[GitHubCopilot] Failed to fetch models:', response.status, response.statusText);
                const text = await response.text();
                console.warn('[GitHubCopilot] Response body:', text);
                return this.getDefaultModels();
            }
            const data = await response.json();
            console.log('[GitHubCopilot] Models API response keys:', Object.keys(data));
            // Handle both { models: [...] } and { data: [...] } response formats
            const models = data.models || data.data || [];
            if (!Array.isArray(models) || models.length === 0) {
                console.warn('[GitHubCopilot] No models array in response, using defaults');
                return this.getDefaultModels();
            }
            // Filter to only include chat models (exclude embeddings, etc.)
            const chatModels = models.filter((m) => m.capabilities?.type === 'chat' || !m.capabilities?.type);
            const modelIds = chatModels.map((m) => m.id);
            console.log('[GitHubCopilot] Fetched models:', modelIds);
            return modelIds.length > 0 ? modelIds : this.getDefaultModels();
        }
        catch (error) {
            console.error('[GitHubCopilot] Error fetching models:', error);
            return this.getDefaultModels();
        }
    }
    /**
     * Get model display names
     */
    getModelDisplayNames(models) {
        const displayNames = {
            'gpt-4o': 'GPT-4o',
            'gpt-4o-mini': 'GPT-4o Mini',
            'gpt-4-turbo': 'GPT-4 Turbo',
            'gpt-4': 'GPT-4',
            'gpt-3.5-turbo': 'GPT-3.5 Turbo',
            'claude-3.5-sonnet': 'Claude 3.5 Sonnet',
            'claude-3-opus': 'Claude 3 Opus',
            'claude-3-sonnet': 'Claude 3 Sonnet',
            'claude-3-haiku': 'Claude 3 Haiku',
            'o1-preview': 'o1 Preview',
            'o1-mini': 'o1 Mini',
            'o1': 'o1'
        };
        const result = {};
        for (const model of models) {
            result[model] = displayNames[model] || model;
        }
        return result;
    }
}
// ============================================================================
// Singleton Export
// ============================================================================
let providerInstance = null;
export function getGitHubCopilotProvider() {
    if (!providerInstance) {
        providerInstance = new GitHubCopilotProvider();
    }
    return providerInstance;
}
export { GitHubCopilotProvider };
//# sourceMappingURL=github-copilot.provider.js.map