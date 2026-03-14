/**
 * Agent Module - Server-side Index
 *
 * Main entry point for the server-side agent module.
 * Exports all public APIs for sending messages, managing sessions,
 * and handling agent-related functionality.
 *
 * This is the server-side version that replaces Electron dependencies
 * with Node.js native equivalents and WebSocket-based communication.
 */

// ============================================
// Core Types
// ============================================

export type {
  // API Credentials
  ApiCredentials,

  // Image Attachments
  ImageMediaType,
  ImageAttachment,

  // Canvas Context
  CanvasContext,

  // Agent Request
  AgentRequest,

  // Tool Calls
  ToolCall,

  // Thoughts
  ThoughtType,
  Thought,

  // Session State
  SessionState,

  // V2 Session Types
  V2SDKSession,
  V2SessionInfo,
  SessionConfig,

  // MCP Types
  McpServerStatusInfo,

  // Token Usage
  TokenUsage,
  SingleCallUsage
} from './types'

// ============================================
// Send Message
// ============================================

export { sendMessage } from './send-message'

// ============================================
// Control Functions
// ============================================

import { stopGeneration } from './control'
import { activeSessions } from './session-manager'
import type { SessionState } from './types'

/**
 * Get session state for a conversation
 */
export function getSessionState(conversationId: string): SessionState | undefined {
  return activeSessions.get(conversationId)
}

/**
 * Check if a conversation is currently generating
 */
export function isGenerating(conversationId: string): boolean {
  const session = activeSessions.get(conversationId)
  return session ? true : false
}

/**
 * Approve a tool call
 */
export async function approveTool(conversationId: string, toolId?: string): Promise<void> {
  // TODO: Implement tool approval logic
  console.log(`[Agent] Tool approved: ${conversationId}, ${toolId}`)
}

/**
 * Reject a tool call
 */
export async function rejectTool(conversationId: string, toolId?: string): Promise<void> {
  // TODO: Implement tool rejection logic
  console.log(`[Agent] Tool rejected: ${conversationId}, ${toolId}`)
}

/**
 * Warm up a session (pre-initialize V2 Session)
 */
export async function warmSession(spaceId: string, conversationId: string): Promise<void> {
  // TODO: Implement session warming
  console.log(`[Agent] Session warmed: ${spaceId}, ${conversationId}`)
}

/**
 * Answer a question from the agent
 */
export async function answerQuestion(conversationId: string, questionId: string, answers: any): Promise<void> {
  // TODO: Implement question answering
  console.log(`[Agent] Question answered: ${conversationId}, ${questionId}`)
}

/**
 * Get MCP server status
 */
export async function getMcpServerStatus(): Promise<any[]> {
  // TODO: Implement MCP status retrieval
  return []
}

export { stopGeneration }

// ============================================
// Session Management
// ============================================

export {
  // V2 Session lifecycle
  getOrCreateV2Session,
  ensureSessionWarm,
  closeV2Session,
  closeAllV2Sessions,
  invalidateAllSessions,

  // Active session state
  createSessionState,
  registerActiveSession,
  unregisterActiveSession,
  getActiveSession,

  // Session maps (for advanced use cases)
  activeSessions,
  v2Sessions
} from './session-manager'

// ============================================
// Stream Processing
// ============================================

export {
  processStream,
  type StreamCallbacks,
  type StreamResult,
  type ProcessStreamParams
} from './stream-processor'

// ============================================
// SDK Configuration
// ============================================

export {
  // Credential resolution
  resolveCredentialsForSdk,
  type ResolvedSdkCredentials,

  // Environment building
  buildSdkEnv,
  getCleanUserEnv,
  type SdkEnvParams,

  // SDK options building
  buildBaseSdkOptions,
  type BaseSdkOptionsParams
} from './sdk-config'

// ============================================
// System Prompt
// ============================================

export {
  buildSystemPrompt,
  buildSystemPromptWithAIBrowser,
  DEFAULT_ALLOWED_TOOLS,
  type AllowedTool,
  type SystemPromptContext
} from './system-prompt'

// ============================================
// Helpers
// ============================================

export {
  // Path management
  getNodePath,
  getWorkingDir,

  // API credentials
  getApiCredentials,
  getApiCredentialsForSource,
  inferOpenAIWireApi,

  // MCP server filtering
  getEnabledMcpServers,

  // Communication
  sendToRenderer,
  broadcastToAllClients,
  setMainWindow,
  getMainWindow
} from './helpers'

// ============================================
// Permission Handler
// ============================================

export {
  createCanUseTool,
  resolveQuestion,
  rejectQuestion,
  rejectAllQuestions
} from './permission-handler'

// ============================================
// Message Utilities
// ============================================

export {
  // Canvas context
  formatCanvasContext,

  // Message building
  buildMessageContent,

  // SDK message parsing
  parseSDKMessage,

  // Token usage extraction
  extractSingleUsage,
  extractResultUsage
} from './message-utils'
