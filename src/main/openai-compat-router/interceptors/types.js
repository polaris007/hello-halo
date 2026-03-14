/**
 * Request Interceptor Types
 *
 * Interceptors operate on Anthropic Messages API format (the SDK's native format).
 * This ensures interceptors work identically for all providers — both Anthropic
 * passthrough and OpenAI-compatible backends — without format-dependent branching.
 *
 * Interceptors run BEFORE any format conversion, so they always see the original
 * Anthropic request and respond in Anthropic SSE format.
 */
export {};
//# sourceMappingURL=types.js.map