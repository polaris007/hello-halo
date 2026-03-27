/**
 * Agent Module - Type Definitions
 *
 * Centralized type definitions for the agent module.
 * Server-side version - removed Electron dependencies.
 */

// ============================================
// API Credentials
// ============================================

/**
 * API credentials for agent requests
 * Unified structure for custom API and OAuth sources
 */
export interface ApiCredentials {
  baseUrl: string
  apiKey: string
  model: string
  displayModel?: string
  provider: 'anthropic' | 'openai' | 'oauth'
  /** Custom headers for OAuth providers */
  customHeaders?: Record<string, string>
  /** API type for OpenAI compatible providers */
  apiType?: 'chat_completions' | 'responses' | 'anthropic_passthrough'
  /** Force streaming mode (for providers that only support streaming) */
  forceStream?: boolean
  /** Filter sensitive content from messages (e.g., GitHub URLs) */
  filterContent?: boolean
}

// ============================================
// Image Attachments
// ============================================

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface ImageAttachment {
  id: string
  type: 'image'
  mediaType: ImageMediaType
  data: string  // Base64 encoded
  name?: string
  size?: number
}

// ============================================
// Canvas Context
// ============================================

/**
 * Canvas Context - Injected into messages to provide AI awareness of user's open tabs
 * This allows AI to naturally understand what the user is currently viewing
 */
export interface CanvasContext {
  isOpen: boolean
  tabCount: number
  activeTab: {
    type: string  // 'browser' | 'code' | 'markdown' | 'image' | 'pdf' | 'text' | 'json' | 'csv'
    title: string
    url?: string   // For browser/pdf tabs
    path?: string  // For file tabs
  } | null
  tabs: Array<{
    type: string
    title: string
    url?: string
    path?: string
    isActive: boolean
  }>
}

// ============================================
// Agent Request
// ============================================

export interface AgentRequest {
  spaceId: string
  conversationId: string
  message: string
  resumeSessionId?: string
  images?: ImageAttachment[]  // Optional images for multi-modal messages
  aiBrowserEnabled?: boolean  // Enable AI Browser tools for this request
  thinkingEnabled?: boolean   // Enable extended thinking mode (maxThinkingTokens: 10240)
  model?: string              // Model to use (for future model switching)
  canvasContext?: CanvasContext  // Current canvas state for AI awareness
}

// ============================================
// Tool Calls
// ============================================

export interface ToolCall {
  id: string
  name: string
  status: 'pending' | 'running' | 'success' | 'error' | 'waiting_approval'
  input: Record<string, unknown>
  output?: string
  error?: string
  progress?: number
  requiresApproval?: boolean
  description?: string
}

// ============================================
// Thoughts (Agent Reasoning Process)
// ============================================

export type ThoughtType = 'thinking' | 'text' | 'tool_use' | 'tool_result' | 'system' | 'result' | 'error'

export interface Thought {
  id: string
  type: ThoughtType
  content: string
  timestamp: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
  isError?: boolean
  errorCode?: string  // Original SDK error code (rate_limit, authentication_failed, etc.)
  duration?: number
  // For streaming state (real-time updates)
  isStreaming?: boolean  // True while content is being streamed
  isReady?: boolean      // True when tool params are complete (for tool_use)
  // For merged tool result display (tool_use contains its result)
  toolResult?: {
    output: string
    isError: boolean
    timestamp: string
  }
}

// ============================================
// Session State
// ============================================

/**
 * Active session state for a conversation
 * Used to track in-flight requests and accumulated thoughts
 */
export interface SessionState {
  abortController: AbortController
  spaceId: string
  conversationId: string
  thoughts: Thought[]  // Backend accumulates thoughts (Single Source of Truth)
  isGenerating?: boolean
  /** SSE 连接建立时间 */
  sseConnectedAt?: number
  /** 最后活动时间（用于超时清理） */
  lastActivityAt?: number
}

// ============================================
// V2 Session Types
// ============================================

/**
 * V2 SDK Session interface
 *
 * Note: SDK types are unstable after patching (return values may not be Promise<...>),
 * using minimal interface for type safety and maintainability, avoiding inference to never.
 */
export type V2SDKSession = {
  send: (message: any) => void
  stream: () => AsyncIterable<any>
  close: () => void
  interrupt?: () => Promise<void> | void
  // Dynamic runtime methods (exposed via patch)
  setModel?: (model: string | undefined) => Promise<void>
  setMaxThinkingTokens?: (maxThinkingTokens: number | null) => Promise<void>
  setPermissionMode?: (mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan') => Promise<void>
}

/**
 * Session configuration that requires session rebuild when changed
 * These are "process-level" parameters fixed at Claude Code subprocess startup
 *
 * Note: model changes are handled via credentialsGeneration in config.service
 * (model is part of the aiSources signature), not through SessionConfig.
 */
export interface SessionConfig {
  aiBrowserEnabled: boolean
  // thinkingEnabled is dynamic via setMaxThinkingTokens, no rebuild needed
}

/**
 * V2 Session info stored in the sessions map
 */
export interface V2SessionInfo {
  session: V2SDKSession
  spaceId: string
  conversationId: string
  createdAt: number
  lastUsedAt: number
  // Track config at session creation time for rebuild detection
  config: SessionConfig
  // Credentials generation at session creation time
  // Used to detect stale credentials (session created before config change)
  credentialsGeneration: number
  /** 是否有活跃的 SSE 连接 */
  isSSEActive?: boolean
}

// ============================================
// MCP Types
// ============================================

/**
 * MCP server status type (matches SDK)
 */
export interface McpServerStatusInfo {
  name: string
  status: 'connected' | 'failed' | 'needs-auth' | 'pending'
  serverInfo?: {
    name: string
    version: string
  }
  error?: string
}

// ============================================
// Token Usage
// ============================================

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  totalCostUsd: number
  contextWindow: number
}

export interface SingleCallUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

// ============================================
// Stream Processing
// ============================================

/**
 * Result returned when stream processing finishes.
 * Contains all data needed by callers for post-stream handling.
 */
export interface StreamResult {
  /** Final text content (last text block or streaming fallback) */
  finalContent: string
  /** Accumulated thoughts (thinking, tool_use, tool_result, text, error, etc.) */
  thoughts: Thought[]
  /** Token usage from the result message */
  tokenUsage: TokenUsage | null
  /** Captured session ID (from system/result messages, for session persistence) */
  capturedSessionId?: string
  /** Whether the stream was interrupted (no result message or error_during_execution) */
  isInterrupted: boolean
  /** Whether the user aborted via AbortController */
  wasAborted: boolean
  /** Whether an error thought was received (e.g., rate limit, auth failure) */
  hasErrorThought: boolean
  /** The error thought itself, if any */
  errorThought?: Thought
  /** Whether the session hit the SDK's maxTurns limit (error_max_turns subtype) */
  reachedMaxTurns: boolean
}

/**
 * Callbacks for caller-specific behavior (storage, JSONL writing, etc.)
 *
 * The stream processor handles all streaming logic and renderer events.
 * Callers provide callbacks for their specific needs:
 * - Main agent: persists to conversation.service, saves session ID
 * - Automation: writes to JSONL via session-store
 */
export interface StreamCallbacks {
  /** Called once when stream finishes — caller handles storage */
  onComplete(result: StreamResult): void
  /** Called for each raw SDK message (for JSONL persistence in automation) */
  onRawMessage?(sdkMessage: any): void
  /** Called at key points during streaming for incremental persistence */
  onIncrementalPersist?(data: IncrementalPersistData): void
}

/**
 * Data for incremental persistence
 */
export interface IncrementalPersistData {
  /** Current accumulated text content */
  content: string
  /** Current accumulated thoughts */
  thoughts: Thought[]
  /** Whether this is a partial (incomplete) message */
  isPartial: boolean
}

/**
 * Parameters for processStream.
 * All data needed to process a V2 SDK session stream.
 */
export interface ProcessStreamParams {
  /** The V2 SDK session (already created by caller) */
  v2Session: V2SDKSession
  /** Session state (holds thoughts array — shared with session-manager) */
  sessionState: SessionState
  /** Space ID for renderer event routing */
  spaceId: string
  /** Conversation ID for renderer event routing (can be virtual like "app-chat:{appId}") */
  conversationId: string
  /** Already-prepared message content (string or multi-modal content blocks) */
  messageContent: string | Array<{ type: string; [key: string]: unknown }>
  /** Display model name for thought parsing (user's configured model, not SDK internal) */
  displayModel: string
  /** Abort controller for cancellation */
  abortController: AbortController
  /** Timestamp of send start (for timing logs) */
  t0: number
  /** Strategy callbacks for caller-specific behavior */
  callbacks: StreamCallbacks
}

// ============================================
// SDK Configuration
// ============================================

/**
 * Resolved credentials ready for SDK use.
 * This is the output of credential resolution process.
 */
export interface ResolvedSdkCredentials {
  /** Base URL for Anthropic API (may be OpenAI compat router) */
  anthropicBaseUrl: string
  /** API key for Anthropic API (may be encoded backend config) */
  anthropicApiKey: string
  /** Model to pass to SDK (may be fake Claude model for compat) */
  sdkModel: string
  /** User's actual configured model name (for display) */
  displayModel: string
}

/**
 * Parameters for building SDK environment variables
 */
export interface SdkEnvParams {
  anthropicApiKey: string
  anthropicBaseUrl: string
}

/**
 * Parameters for building base SDK options
 */
export interface BaseSdkOptionsParams {
  /** Resolved SDK credentials */
  credentials: ResolvedSdkCredentials
  /** Working directory for the agent */
  workDir: string
  /** Path to Node.js executable (replaces Electron in server mode) */
  nodePath: string
  /** Space ID */
  spaceId: string
  /** Conversation ID */
  conversationId: string
  /** Abort controller for cancellation */
  abortController: AbortController
  /** Optional stderr handler (for error accumulation) */
  stderrHandler?: (data: string) => void
  /** Optional MCP servers configuration */
  mcpServers?: Record<string, any> | null
  /** Maximum tool call turns per message (from config) */
  maxTurns?: number
}
