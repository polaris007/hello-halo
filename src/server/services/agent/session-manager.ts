/**
 * Agent Module - Session Manager (Server-side simplified version)
 *
 * Manages V2 Session lifecycle including creation, reuse, cleanup.
 * Simplified version for server-side environment.
 */

import path from 'path'
import os from 'os'
import { existsSync, copyFileSync, mkdirSync } from 'fs'
import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk'
import type {
  V2SDKSession,
  V2SessionInfo,
  SessionConfig,
  SessionState,
  Thought
} from './types'
import type { SseWriter } from '../../utils/sse-writer'
import {
  getNodePath,
  getWorkingDir,
  getApiCredentials,
  getEnabledMcpServers
} from './helpers'
import { resolveCredentialsForSdk, buildBaseSdkOptions } from './sdk-config'
import { getConfig } from '../config.service'

// ============================================
// User Data Path (Server-side replacement for app.getPath('userData'))
// ============================================

function getUserDataPath(): string {
  const config = getConfig()
  return config.data.basePath
}

// ============================================
// Session Maps
// ============================================

/** Active V2 sessions by conversationId */
export const v2Sessions = new Map<string, V2SessionInfo>()

/** Active session state for in-flight requests */
export const activeSessions = new Map<string, SessionState>()

/** SSE 连接信息 */
interface SSEStreamEntry {
  conversationId: string
  sseWriter?: SseWriter
  controller: AbortController
  connectedAt: number
  lastActivityAt: number
  timeoutId: NodeJS.Timeout
}

/** Active SSE streams by conversationId */
export const activeSSEStreams = new Map<string, SSEStreamEntry>()

/** SSE connection timeout (30 minutes) */
const SSE_TIMEOUT_MS = 30 * 60 * 1000

/**
 * Register an active SSE stream
 */
export function registerSSEStream(
  conversationId: string,
  sseWriter: SseWriter | undefined,
  controller: AbortController
): void {
  const now = Date.now()

  // 如果已有连接，先取消旧连接
  const existing = activeSSEStreams.get(conversationId)
  if (existing) {
    console.log(`[SSE][${conversationId}] Closing existing SSE connection`)
    clearTimeout(existing.timeoutId)
    existing.controller.abort()
    activeSSEStreams.delete(conversationId)
    // 取消该对话的等待状态
    cancelPendingInput(conversationId)
  }

  // 设置超时定时器
  const timeoutId = setTimeout(() => {
    console.log(`[SSE][${conversationId}] SSE timeout after ${SSE_TIMEOUT_MS / 60000} minutes`)
    const entry = activeSSEStreams.get(conversationId)
    if (entry) {
      entry.controller.abort()
      activeSSEStreams.delete(conversationId)
      // 同步更新 V2 Session 状态
      const sessionInfo = v2Sessions.get(conversationId)
      if (sessionInfo) {
        sessionInfo.isSSEActive = false
      }
      console.log(`[SSE][${conversationId}] SSE stream timed out and cleaned`)
    }
  }, SSE_TIMEOUT_MS)

  // 注册新连接
  activeSSEStreams.set(conversationId, {
    conversationId,
    sseWriter,
    controller,
    connectedAt: now,
    lastActivityAt: now,
    timeoutId
  })

  // 同步更新 V2 Session 状态
  const sessionInfo = v2Sessions.get(conversationId)
  if (sessionInfo) {
    sessionInfo.isSSEActive = true
  }

  // 同步更新 activeSessions
  const sessionState = activeSessions.get(conversationId)
  if (sessionState) {
    sessionState.sseConnectedAt = now
    sessionState.lastActivityAt = now
  }

  console.log(`[SSE][${conversationId}] SSE stream registered, active: ${activeSSEStreams.size}`)
}

/**
 * Unregister an active SSE stream
 */
export function unregisterSSEStream(conversationId: string): void {
  const entry = activeSSEStreams.get(conversationId)
  if (entry) {
    clearTimeout(entry.timeoutId)
    // 注意：不调用 controller.abort()，由调用方决定
    activeSSEStreams.delete(conversationId)

    // 同步更新 V2 Session 状态
    const sessionInfo = v2Sessions.get(conversationId)
    if (sessionInfo) {
      sessionInfo.isSSEActive = false
    }

    console.log(`[SSE][${conversationId}] SSE stream unregistered, active: ${activeSSEStreams.size}`)
  }
}

/**
 * Get active SSE stream
 */
export function getSSEStream(conversationId: string): SSEStreamEntry | undefined {
  return activeSSEStreams.get(conversationId)
}

/**
 * Update SSE stream activity timestamp
 */
export function updateSSEActivity(conversationId: string): void {
  const stream = activeSSEStreams.get(conversationId)
  if (stream) {
    stream.lastActivityAt = Date.now()
  }
}


// ============================================
// Session State Management
// ============================================

/**
 * Create a new session state object
 */
export function createSessionState(
  spaceId: string,
  conversationId: string,
  abortController: AbortController
): SessionState {
  return {
    abortController,
    spaceId,
    conversationId,
    thoughts: [],
    isGenerating: false
  }
}

/**
 * Register an active session
 */
export function registerActiveSession(conversationId: string, state: SessionState): void {
  state.isGenerating = true
  activeSessions.set(conversationId, state)
  console.log(`[Agent][${conversationId}] Session registered, active: ${activeSessions.size}`)
}

/**
 * Unregister an active session
 */
export function unregisterActiveSession(conversationId: string): void {
  activeSessions.delete(conversationId)
  console.log(`[Agent][${conversationId}] Session unregistered, active: ${activeSessions.size}`)
}

/**
 * Get active session state
 */
export function getActiveSession(conversationId: string): SessionState | undefined {
  return activeSessions.get(conversationId)
}

// ============================================
// V2 Session Management
// ============================================

/**
 * Check if session transport is ready
 */
function isSessionTransportReady(session: V2SDKSession): boolean {
  try {
    // Try to access the session's internal state
    const s = session as any
    // Check if the session has a transport and it's ready
    if (s._transport) {
      return s._transport.readyState === 'open' || s._transport.readyState === 1
    }
    // If no transport property, assume it's ready (fallback)
    return true
  } catch {
    return false
  }
}

/**
 * Get or create a V2 session for a conversation
 */
export async function getOrCreateV2Session(
  spaceId: string,
  conversationId: string,
  sdkOptions: any,
  sessionId?: string,
  config?: SessionConfig,
  workDir?: string
): Promise<V2SDKSession> {
  const existing = v2Sessions.get(conversationId)

  if (existing) {
    // Check if session is still alive
    if (!isSessionTransportReady(existing.session)) {
      console.log(`[Agent][${conversationId}] Session transport not ready, recreating...`)
      closeV2Session(conversationId)
    } else {
      console.log(`[Agent][${conversationId}] Reusing existing V2 session`)
      existing.lastUsedAt = Date.now()
      return existing.session
    }
  }

  // Create new session
  console.log(`[Agent][${conversationId}] Creating new V2 session...`)
  console.log(`[Agent][${conversationId}] SDK Options:`)
  console.log(`[Agent][${conversationId}]   - model: ${sdkOptions.model}`)
  console.log(`[Agent][${conversationId}]   - cwd: ${sdkOptions.cwd}`)
  console.log(`[Agent][${conversationId}]   - maxTurns: ${sdkOptions.maxTurns}`)
  console.log(`[Agent][${conversationId}]   - includePartialMessages: ${sdkOptions.includePartialMessages}`)
  console.log(`[Agent][${conversationId}]   - permissionMode: ${sdkOptions.permissionMode}`)
  console.log(`[Agent][${conversationId}]   - executable: ${sdkOptions.executable}`)
  console.log(`[Agent][${conversationId}]   - env.ANTHROPIC_API_KEY: ${sdkOptions.env?.ANTHROPIC_API_KEY ? sdkOptions.env.ANTHROPIC_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`)
  console.log(`[Agent][${conversationId}]   - env.ANTHROPIC_BASE_URL: ${sdkOptions.env?.ANTHROPIC_BASE_URL}`)
  console.log(`[Agent][${conversationId}]   - env.CLAUDE_CONFIG_DIR: ${sdkOptions.env?.CLAUDE_CONFIG_DIR}`)

  const session = await unstable_v2_createSession(sdkOptions)

  // Store session info
  const sessionInfo: V2SessionInfo = {
    session,
    spaceId,
    conversationId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    config: config || { aiBrowserEnabled: false },
    credentialsGeneration: 1
  }

  v2Sessions.set(conversationId, sessionInfo)
  console.log(`[Agent][${conversationId}] V2 session created, total: ${v2Sessions.size}`)

  return session
}

/**
 * Close a V2 session
 */
export function closeV2Session(conversationId: string): void {
  const info = v2Sessions.get(conversationId)
  if (info) {
    try {
      info.session.close()
    } catch (error) {
      console.error(`[Agent][${conversationId}] Error closing session:`, error)
    }
    v2Sessions.delete(conversationId)
    console.log(`[Agent][${conversationId}] V2 session closed, remaining: ${v2Sessions.size}`)
  }
}

/**
 * Close all V2 sessions
 */
export function closeAllV2Sessions(): void {
  console.log(`[Agent] Closing all V2 sessions (${v2Sessions.size})...`)
  for (const [conversationId, info] of v2Sessions) {
    try {
      info.session.close()
    } catch (error) {
      console.error(`[Agent][${conversationId}] Error closing session:`, error)
    }
  }
  v2Sessions.clear()
  console.log('[Agent] All V2 sessions closed')
}

/**
 * Invalidate all sessions (called when config changes)
 */
export function invalidateAllSessions(): void {
  console.log(`[Agent] Invalidating all sessions (${v2Sessions.size})...`)

  // Close sessions that don't have active requests
  for (const [conversationId, info] of v2Sessions) {
    if (!activeSessions.has(conversationId)) {
      try {
        info.session.close()
      } catch (error) {
        console.error(`[Agent][${conversationId}] Error closing session:`, error)
      }
      v2Sessions.delete(conversationId)
    } else {
      console.log(`[Agent][${conversationId}] Request in flight, deferring invalidation`)
    }
  }
}

/**
 * Ensure session is warm (pre-initialize for faster first response)
 */
export async function ensureSessionWarm(
  spaceId: string,
  conversationId: string
): Promise<void> {
  console.log(`[Agent][${conversationId}] Warming session...`)

  try {
    const workDir = getWorkingDir(spaceId)
    const credentials = await getApiCredentials()
    const resolvedCredentials = await resolveCredentialsForSdk(credentials)
    const nodePath = getNodePath()

    const sdkOptions = buildBaseSdkOptions({
      credentials: resolvedCredentials,
      workDir,
      nodePath,
      spaceId,
      conversationId,
      abortController: new AbortController(),
      mcpServers: null,
      maxTurns: 50
    })

    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: false
    }

    await getOrCreateV2Session(spaceId, conversationId, sdkOptions, undefined, sessionConfig, workDir)
    console.log(`[Agent][${conversationId}] Session warmed successfully`)
  } catch (error) {
    console.error(`[Agent][${conversationId}] Failed to warm session:`, error)
    throw error
  }
}

// ============================================
// Session Cleanup
// ============================================

const SESSION_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Clean up stale sessions
 * @deprecated Use cleanupStaleResources instead
 */
export function cleanupStaleSessions(): void {
  cleanupStaleResources()
}

/**
 * Unified cleanup of stale resources (SSE streams and V2 sessions)
 */
export function cleanupStaleResources(): void {
  const now = Date.now()
  let sseCleaned = 0
  let sessionCleaned = 0

  // 1. 清理超时的 SSE 连接
  for (const [conversationId, entry] of activeSSEStreams) {
    // 如果正在生成中，跳过
    const sessionState = activeSessions.get(conversationId)
    if (sessionState?.isGenerating) {
      continue
    }

    // 检查超时
    if (now - entry.lastActivityAt > SSE_TIMEOUT_MS) {
      try {
        entry.controller.abort()
      } catch (e) {
        // ignore
      }
      clearTimeout(entry.timeoutId)
      activeSSEStreams.delete(conversationId)

      // 同步更新 V2 Session
      const sessionInfo = v2Sessions.get(conversationId)
      if (sessionInfo) {
        sessionInfo.isSSEActive = false
      }

      sseCleaned++
      console.log(`[Agent][${conversationId}] SSE stream timed out and cleaned`)
    }
  }

  // 2. 清理超时的 V2 Session
  for (const [conversationId, info] of v2Sessions) {
    // 跳过有活跃 SSE 连接或正在生成的会话
    if (info.isSSEActive || activeSessions.has(conversationId)) {
      continue
    }

    if (now - info.lastUsedAt > SESSION_TIMEOUT_MS) {
      try {
        info.session.close()
      } catch (error) {
        console.error(`[Agent][${conversationId}] Error closing stale session:`, error)
      }
      v2Sessions.delete(conversationId)
      sessionCleaned++
    }
  }

  if (sseCleaned > 0 || sessionCleaned > 0) {
    console.log(`[Agent] Cleaned up: ${sseCleaned} SSE streams, ${sessionCleaned} sessions`)
  }
}

// Start periodic cleanup
setInterval(cleanupStaleResources, 5 * 60 * 1000) // Every 5 minutes

// ============================================
// Pending Input Resolvers (for tool approval and AskUserQuestion)
// ============================================

interface PendingInputEntry {
  resolve: (value: { approved?: boolean; answers?: Record<string, string> }) => void
  reject: (reason: any) => void
  inputType: 'tool-approval' | 'ask-question'
  createdAt: number
  timeoutId?: NodeJS.Timeout
  toolCallId?: string
  questionId?: string
}

/** Map of conversationId -> pending input resolver */
const pendingInputResolvers = new Map<string, PendingInputEntry>()

/**
 * Wait for user input (tool approval or question answers)
 */
export async function waitForUserInput(
  conversationId: string,
  inputType: 'tool-approval' | 'ask-question',
  metadata: { toolCallId?: string; questionId?: string },
  signal?: AbortSignal,
  timeoutMs: number = 5 * 60 * 1000 // 5 minutes default timeout
): Promise<{ approved?: boolean; answers?: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    // Set timeout
    const timeoutId = setTimeout(() => {
      const entry = pendingInputResolvers.get(conversationId)
      if (entry && entry.inputType === inputType) {
        pendingInputResolvers.delete(conversationId)
        reject(new Error('User input timeout'))
      }
    }, timeoutMs)

    // Store resolver
    pendingInputResolvers.set(conversationId, {
      resolve: (value) => {
        clearTimeout(timeoutId)
        pendingInputResolvers.delete(conversationId)
        resolve(value)
      },
      reject: (reason) => {
        clearTimeout(timeoutId)
        pendingInputResolvers.delete(conversationId)
        reject(reason)
      },
      inputType,
      createdAt: Date.now(),
      timeoutId,
      toolCallId: metadata.toolCallId,
      questionId: metadata.questionId
    })

    // Listen for abort signal
    if (signal) {
      const onAbort = () => {
        const entry = pendingInputResolvers.get(conversationId)
        if (entry && entry.inputType === inputType) {
          entry.reject(new Error('Aborted'))
        }
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
  })
}

/**
 * Resolve pending user input (called by HTTP endpoints)
 */
export function resolveUserInput(
  conversationId: string,
  result: { approved?: boolean; answers?: Record<string, string> }
): boolean {
  const pending = pendingInputResolvers.get(conversationId)
  if (pending) {
    pending.resolve(result)
    return true
  }
  return false
}

/**
 * Cancel pending user input (called when SSE connection closes or stop endpoint is called)
 */
export function cancelPendingInput(conversationId: string): void {
  const pending = pendingInputResolvers.get(conversationId)
  if (pending) {
    pending.reject(new Error('SSE connection closed'))
    pendingInputResolvers.delete(conversationId)
  }
}

/**
 * Clean up stale pending inputs
 */
function cleanupStalePendingInputs(): void {
  const now = Date.now()
  const TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

  for (const [conversationId, entry] of pendingInputResolvers) {
    if (now - entry.createdAt > TIMEOUT_MS) {
      entry.reject(new Error('Input timeout'))
      pendingInputResolvers.delete(conversationId)
    }
  }
}

/**
 * Check if there is pending user input for a conversation
 */
export function getPendingInput(conversationId: string): boolean {
  return pendingInputResolvers.has(conversationId)
}

// Start periodic cleanup for pending inputs
setInterval(cleanupStalePendingInputs, 5 * 60 * 1000) // Every 5 minutes
