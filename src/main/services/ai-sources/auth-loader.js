/**
 * Auth Provider Loader
 *
 * Dynamically loads authentication providers based on product.json configuration.
 *
 * Design Principles:
 * - Configuration-driven provider loading
 * - Graceful fallback when providers are unavailable
 * - Type-safe provider interface enforcement
 */
import { join, dirname } from 'path';
import { pathToFileURL } from 'url';
import { existsSync } from 'fs';
import { app } from 'electron';
// ============================================================================
// Product Configuration Loading
// ============================================================================
let productConfig = null;
let productConfigPath = null;
/**
 * Get the path to product.json
 */
function getProductConfigPath() {
    if (productConfigPath)
        return productConfigPath;
    // In development, product.json is in project root
    // In production, it's inside app.asar
    const isDev = !app.isPackaged;
    if (isDev) {
        // Development: project root (app.getAppPath() returns project root in dev)
        productConfigPath = join(app.getAppPath(), 'product.json');
    }
    else {
        // Production: inside app.asar (app.getAppPath() returns app.asar path)
        // Electron automatically handles app.asar paths
        productConfigPath = join(app.getAppPath(), 'product.json');
    }
    return productConfigPath;
}
/**
 * Load product.json configuration
 */
export function loadProductConfig() {
    if (productConfig)
        return productConfig;
    const configPath = getProductConfigPath();
    try {
        if (existsSync(configPath)) {
            // Use require for synchronous loading (config is needed at startup)
            delete require.cache[require.resolve(configPath)];
            productConfig = require(configPath);
            console.log('[AuthLoader] Loaded product.json from:', configPath);
            console.log('[AuthLoader] Auth providers configured:', productConfig.authProviders.map(p => p.type).join(', '));
        }
        else {
            console.log('[AuthLoader] product.json not found, using defaults');
            productConfig = getDefaultProductConfig();
        }
    }
    catch (error) {
        console.error('[AuthLoader] Failed to load product.json:', error);
        productConfig = getDefaultProductConfig();
    }
    return productConfig;
}
/**
 * Get default product configuration (open-source version)
 */
function getDefaultProductConfig() {
    return {
        name: 'Halo',
        version: '1.0.0',
        authProviders: [
            {
                type: 'custom',
                displayName: { en: 'Custom API', 'zh-CN': '自定义 API' },
                description: { en: 'Claude / OpenAI compatible', 'zh-CN': '兼容 Claude / OpenAI' },
                icon: 'key',
                iconBgColor: '#da7756',
                recommended: true,
                builtin: true,
                enabled: true
            }
        ]
    };
}
// ============================================================================
// Provider Loading
// ============================================================================
/**
 * Resolve the absolute path to a provider module
 */
function resolveProviderPath(providerConfig) {
    if (!providerConfig.path)
        return null;
    const configPath = getProductConfigPath();
    const configDir = dirname(configPath);
    // Remove leading ./ from path if present
    const cleanPath = providerConfig.path.startsWith('./')
        ? providerConfig.path.slice(2)
        : providerConfig.path;
    // Resolve path relative to product.json
    return join(configDir, cleanPath);
}
/**
 * Load a provider module dynamically using ESM import()
 */
async function loadProviderModuleAsync(providerPath) {
    try {
        // Check if the provider directory exists
        if (!existsSync(providerPath)) {
            console.log(`[AuthLoader] Provider path does not exist: ${providerPath}`);
            return null;
        }
        // Use file URL to ensure Windows paths import correctly
        const importUrl = pathToFileURL(providerPath).href;
        console.log(`[AuthLoader] Attempting to load provider from: ${importUrl}`);
        // Use dynamic import for ESM compatibility
        const providerModule = await import(importUrl);
        // Look for a getter function (e.g., getGoogleProvider)
        const getterNames = Object.keys(providerModule).filter(key => key.startsWith('get') && key.endsWith('Provider') && typeof providerModule[key] === 'function');
        if (getterNames.length > 0) {
            const provider = providerModule[getterNames[0]]();
            console.log(`[AuthLoader] Loaded provider from ${providerPath} using ${getterNames[0]}`);
            return provider;
        }
        // Fallback: look for a class export
        const classNames = Object.keys(providerModule).filter(key => key.endsWith('Provider') && typeof providerModule[key] === 'function');
        if (classNames.length > 0) {
            const ProviderClass = providerModule[classNames[0]];
            const provider = new ProviderClass();
            console.log(`[AuthLoader] Loaded provider from ${providerPath} using class ${classNames[0]}`);
            return provider;
        }
        console.warn(`[AuthLoader] No provider found in module: ${providerPath}`);
        return null;
    }
    catch (error) {
        console.error(`[AuthLoader] Failed to load provider from ${providerPath}:`, error);
        return null;
    }
}
/**
 * Load all enabled providers based on product.json configuration
 * This is the core configuration-driven loading mechanism
 */
export async function loadAuthProvidersAsync() {
    const config = loadProductConfig();
    const loadedProviders = [];
    for (const providerConfig of config.authProviders) {
        if (!providerConfig.enabled) {
            console.log(`[AuthLoader] Skipping disabled provider: ${providerConfig.type}`);
            continue;
        }
        const loaded = {
            config: providerConfig,
            provider: null
        };
        if (providerConfig.builtin) {
            // Built-in provider (loaded separately by manager)
            console.log(`[AuthLoader] Built-in provider: ${providerConfig.type}`);
            loaded.provider = null; // Will be loaded by manager
        }
        else if (providerConfig.path) {
            // External provider - load from path using dynamic import
            const providerPath = resolveProviderPath(providerConfig);
            if (providerPath) {
                loaded.provider = await loadProviderModuleAsync(providerPath);
                if (!loaded.provider) {
                    loaded.loadError = `Failed to load from ${providerPath}`;
                }
            }
        }
        loadedProviders.push(loaded);
    }
    return loadedProviders;
}
/**
 * Synchronous version for backward compatibility (returns configs only)
 * @deprecated Use loadAuthProvidersAsync for full provider loading
 */
export function loadAuthProviders() {
    const config = loadProductConfig();
    return config.authProviders
        .filter(p => p.enabled)
        .map(providerConfig => ({
        config: providerConfig,
        provider: null,
        loadError: providerConfig.builtin ? undefined : 'Use loadAuthProvidersAsync for dynamic loading'
    }));
}
/**
 * Get enabled auth provider configurations for UI
 * This returns only the configs, not the loaded providers
 */
export function getEnabledAuthProviderConfigs() {
    const config = loadProductConfig();
    return config.authProviders.filter(p => p.enabled);
}
/**
 * Check if a specific provider type is available
 */
export function isProviderAvailable(type) {
    const providers = loadAuthProviders();
    const provider = providers.find(p => p.config.type === type);
    return provider !== undefined && (provider.config.builtin || provider.provider !== null);
}
/**
 * Get a specific provider by type
 */
export function getProviderByType(type) {
    const providers = loadAuthProviders();
    return providers.find(p => p.config.type === type) || null;
}
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if a provider supports OAuth
 */
export function isOAuthProvider(provider) {
    return 'startLogin' in provider && 'completeLogin' in provider;
}
//# sourceMappingURL=auth-loader.js.map