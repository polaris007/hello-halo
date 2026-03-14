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
import {
  getNodePath,
  getWorkingDir,
  getApiCredentials,
  getEnabledMcpServers
} from './helpers'
import { resolveCredentialsForSdk, buildBaseSdkOptions } from './sdk-config'

// ============================================
// User Data Path (Server-side replacement for app.getPath('userData'))
// ============================================

function getUserDataPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE
  if (!homeDir) {
    throw new Error('Unable to determine user home directory. HOME or USERPROFILE environment variable must be set.')
  }
  return path.join(homeDir, '.halo')
}

// ============================================
// Session Maps
// ============================================

/** Active V2 sessions by conversationId */
export const v2Sessions = new Map<string, V2SessionInfo>()

/** Active session state for in-flight requests */
export const activeSessions = new Map<string, SessionState>()

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
 */
export function cleanupStaleSessions(): void {
  const now = Date.now()
  let cleaned = 0

  for (const [conversationId, info] of v2Sessions) {
    // Skip active sessions
    if (activeSessions.has(conversationId)) {
      continue
    }

    // Check if session has timed out
    if (now - info.lastUsedAt > SESSION_TIMEOUT_MS) {
      try {
        info.session.close()
      } catch (error) {
        console.error(`[Agent][${conversationId}] Error closing stale session:`, error)
      }
      v2Sessions.delete(conversationId)
      cleaned++
    }
  }

  if (cleaned > 0) {
    console.log(`[Agent] Cleaned up ${cleaned} stale sessions, remaining: ${v2Sessions.size}`)
  }
}

// Start periodic cleanup
setInterval(cleanupStaleSessions, 5 * 60 * 1000) // Every 5 minutes
