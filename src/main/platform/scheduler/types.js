/**
 * platform/scheduler -- Type Definitions
 *
 * Public types for the job scheduling engine.
 * These types form the contract between the scheduler and its consumers
 * (primarily apps/runtime).
 *
 * Design: The scheduler is a general-purpose engine. It does not know about
 * AI, LLM, or Apps. The `metadata` field is an opaque pass-through for
 * consumer-specific data (e.g., appId, subscriptionId).
 */
export {};
//# sourceMappingURL=types.js.map