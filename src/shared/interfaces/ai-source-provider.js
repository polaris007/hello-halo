/**
 * AI Source Provider Interface
 *
 * This interface defines the contract that all AI source providers must implement.
 * Following the Open/Closed Principle - open for extension, closed for modification.
 *
 * Each provider handles:
 * - Authentication (if needed)
 * - Configuration management
 * - Backend request configuration generation
 *
 * Design Notes:
 * - Providers are stateless services
 * - Configuration is stored externally (config service)
 * - Providers generate BackendRequestConfig for the OpenAI compat router
 *
 * Architecture Note (v2 Migration - IMPORTANT for contributors):
 * ==============================================================
 * The internal data structure migrated from v1 to v2:
 *   v1: { current: 'custom', custom: {...}, 'github-copilot': {...} }
 *   v2: { version: 2, currentId: 'uuid', sources: AISource[] }
 *
 * However, the provider interface still uses v1-style config access for
 * backward compatibility with external plugins:
 *
 * - For OAuth providers: AISourceManager converts v2 AISource to v1 format
 *   via buildLegacyOAuthConfig() before calling provider methods.
 *   External plugins continue to work without modification.
 *
 * - For API Key providers: AISourceManager handles config directly from
 *   AISource object, provider methods are NOT called at runtime.
 *
 * TODO (Future Major Version):
 * - Migrate provider interface to accept AISource directly
 * - Update all providers to use new interface
 * - Update docs/custom-providers.md accordingly
 */
/**
 * Type guard to check if provider supports OAuth
 */
export function isOAuthProvider(provider) {
    return 'startLogin' in provider && 'completeLogin' in provider;
}
//# sourceMappingURL=ai-source-provider.js.map