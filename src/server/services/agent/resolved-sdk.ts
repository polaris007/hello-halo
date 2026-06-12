/**
 * Agent Module - Resolved SDK
 *
 * Single entry point for all SDK imports.
 *
 * Rule: No other file may import directly from @anthropic-ai/claude-agent-sdk.
 * All SDK access must go through this file.
 *
 * Architecture:
 * - Zero static SDK imports: the SDK module is loaded dynamically at runtime
 *   via initSdk(). This enables true engine switching in the future.
 * - Only the 'anthropic' engine (CC SDK) is supported in this simplified version.
 * - initSdk() must be called once during bootstrap before any SDK function is used.
 */

/**
 * Minimal shape of what we need from the SDK.
 */
interface SdkModule {
  tool: (...args: any[]) => any
  createSdkMcpServer: (options: any) => any
  unstable_v2_createSession?: (options: any) => Promise<any>
  query: (params: any) => AsyncIterable<any>
}

/**
 * Module state — set once by initSdk(), never changes after that.
 */
let _sdk: SdkModule | null = null
let _initPromise: Promise<void> | null = null

/**
 * Initialize the SDK module.
 *
 * Must be called once at startup before any SDK functions are used.
 * Safe to call multiple times — subsequent calls return the same promise.
 */
export async function initSdk(): Promise<void> {
  if (_initPromise) {
    return _initPromise
  }
  _initPromise = doInitSdk()
  return _initPromise
}

async function doInitSdk(): Promise<void> {
  console.log('[SDK] Initializing CC SDK (@anthropic-ai/claude-agent-sdk)')

  try {
    const sdk = await import(/* @vite-ignore */ '@anthropic-ai/claude-agent-sdk')
    _sdk = sdk as unknown as SdkModule
    console.log('[SDK] CC SDK initialized successfully')
  } catch (error) {
    const message =
      '[SDK] Failed to load @anthropic-ai/claude-agent-sdk.\n' +
      'The package is not available. Run: npm install @anthropic-ai/claude-agent-sdk'
    console.error(message)
    throw new Error(message)
  }
}

function ensureInitialized(): SdkModule {
  if (!_sdk) {
    throw new Error(
      '[SDK] Not initialized. initSdk() must be called during app bootstrap ' +
      'before any SDK function is used.'
    )
  }
  return _sdk
}

/**
 * Define an MCP tool with schema validation.
 */
export function tool(...args: any[]): any {
  return ensureInitialized().tool(...args)
}

/**
 * Create an in-process MCP server from tool definitions.
 */
export function createSdkMcpServer(options: any): any {
  return ensureInitialized().createSdkMcpServer(options)
}

/**
 * Create an agent SDK session.
 *
 * Wraps unstable_v2_createSession from CC SDK for a stable API surface.
 */
export async function createSession(options: Record<string, any>): Promise<any> {
  const sdk = ensureInitialized()
  if (!sdk.unstable_v2_createSession) {
    throw new Error('[SDK] unstable_v2_createSession not found in active SDK.')
  }
  return sdk.unstable_v2_createSession(options)
}

/**
 * Run a one-shot agent query (used for MCP connection testing).
 * Returns an AsyncIterable of SDK messages.
 */
export function query(params: any): AsyncIterable<any> {
  return ensureInitialized().query(params)
}

/**
 * Check if SDK is initialized.
 */
export function isInitialized(): boolean {
  return _sdk !== null
}
