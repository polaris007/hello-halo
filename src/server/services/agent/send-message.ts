/**
 * Agent Module - Send Message (Server-side simplified version)
 *
 * Core message sending logic for server-side environment.
 * Simplified version that removes Electron dependencies.
 *
 * SSE 流式响应架构：
 * - sendMessageWithSSE: SSE 流式响应（主通道）
 * - sendMessage: WebSocket 推送（兼容通道）
 */

import type {
  AgentRequest,
  SessionConfig,
  SessionState,
  Thought
} from './types'
import {
  getNodePath,
  getWorkingDir,
  getApiCredentials,
  getEnabledMcpServers,
  sendToRenderer
} from './helpers'
import { buildSystemPromptWithAIBrowser } from './system-prompt'
import {
  getOrCreateV2Session,
  closeV2Session,
  createSessionState,
  registerActiveSession,
  unregisterActiveSession,
  v2Sessions
} from './session-manager'
import {
  formatCanvasContext,
  buildMessageContent,
} from './message-utils'
import { resolveCredentialsForSdk, buildBaseSdkOptions } from './sdk-config'
import { processStream } from './stream-processor'
import { getDatabase } from '../../utils/database'
import {
  logUserMessage,
  logAiConfig,
  logAiConfigError
} from '../../utils/ai-logger'
import type { SseWriter } from '../../utils/sse-writer'

// Unified fallback error suffix - guides user to check logs
const FALLBACK_ERROR_HINT = 'Check logs in Settings > System > Logs.'

// ============================================
// Send Message
// ============================================

/**
 * Send message to agent (server-side version)
 *
 * This is the main entry point for sending messages to the AI agent.
 * It handles:
 * - API credential resolution
 * - V2 Session creation/reuse
 * - Message streaming with token-level updates
 * - Error handling and recovery
 */
export async function sendMessage(
  request: AgentRequest
): Promise<void> {
  const {
    spaceId,
    conversationId,
    message,
    resumeSessionId,
    images,
    aiBrowserEnabled,
    thinkingEnabled,
    canvasContext
  } = request

  console.log(`[Agent] sendMessage: conv=${conversationId}${images && images.length > 0 ? `, images=${images.length}` : ''}${thinkingEnabled ? ', thinking=ON' : ''}${canvasContext?.isOpen ? `, canvas tabs=${canvasContext.tabCount}` : ''}`)

  // 生成唯一的 requestId，用于关联整个调用链路的日志
  const requestId = logUserMessage({
    spaceId,
    conversationId,
    messageContent: message,
    imageCount: images?.length || 0
  })

  const workDir = getWorkingDir(spaceId)

  // Create abort controller for this session
  const abortController = new AbortController()

  // Accumulate stderr for detailed error messages
  let stderrBuffer = ''

  // Create session state (registered as active AFTER session is ready, see below)
  const sessionState = createSessionState(spaceId, conversationId, abortController)

  // Save user message to database
  saveUserMessage(spaceId, conversationId, message, images)

  // Add placeholder for assistant response
  saveAssistantPlaceholder(spaceId, conversationId)

  try {
    // Get API credentials
    let credentials
    try {
      credentials = await getApiCredentials()
    } catch (credError: unknown) {
      // 记录 AI 配置获取失败日志
      const credErr = credError as Error
      logAiConfigError({
        conversationId,
        requestId,
        errorType: 'config_error',
        errorMessage: credErr.message || 'Failed to get API credentials'
      })
      throw credError
    }

    // 记录 AI 配置日志
    logAiConfig({
      conversationId,
      requestId,
      config: {
        provider: credentials.provider,
        model: credentials.model,
        displayModel: credentials.displayModel,
        baseUrl: credentials.baseUrl,
        apiType: credentials.apiType,
        customHeaders: credentials.customHeaders,
        forceStream: credentials.forceStream,
        filterContent: credentials.filterContent,
        apiKey: credentials.apiKey
      }
    })

    console.log(`[Agent] ============================================`)
    console.log(`[Agent] sendMessage called with params:`)
    console.log(`[Agent]   - spaceId: ${spaceId}`)
    console.log(`[Agent]   - conversationId: ${conversationId}`)
    console.log(`[Agent]   - message: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`)
    console.log(`[Agent]   - resumeSessionId: ${resumeSessionId || 'none'}`)
    console.log(`[Agent]   - images: ${images?.length || 0}`)
    console.log(`[Agent]   - aiBrowserEnabled: ${aiBrowserEnabled}`)
    console.log(`[Agent]   - thinkingEnabled: ${thinkingEnabled}`)
    console.log(`[Agent]   - canvasContext: ${canvasContext ? JSON.stringify(canvasContext) : 'none'}`)
    console.log(`[Agent] --------------------------------------------`)
    console.log(`[Agent] API Credentials:`)
    console.log(`[Agent]   - provider: ${credentials.provider}`)
    console.log(`[Agent]   - model: ${credentials.model}`)
    console.log(`[Agent]   - baseUrl: ${credentials.baseUrl}`)
    console.log(`[Agent]   - apiKey: ${credentials.apiKey ? credentials.apiKey.substring(0, 10) + '...' : 'NOT SET'}`)
    console.log(`[Agent]   - displayModel: ${credentials.displayModel}`)
    console.log(`[Agent]   - customHeaders: ${credentials.customHeaders ? JSON.stringify(credentials.customHeaders) : 'none'}`)
    console.log(`[Agent]   - apiType: ${credentials.apiType || 'default'}`)
    console.log(`[Agent]   - forceStream: ${credentials.forceStream}`)
    console.log(`[Agent]   - filterContent: ${credentials.filterContent}`)
    console.log(`[Agent] ============================================`)

    // Resolve credentials for SDK
    const resolvedCredentials = await resolveCredentialsForSdk(credentials)

    // Get session ID from database if resuming
    const sessionId = resumeSessionId || await getSessionIdFromDb(conversationId)

    // Use Node.js executable path
    const nodePath = getNodePath()
    console.log(`[Agent] Using Node.js runtime: ${nodePath}`)

    // Get enabled MCP servers (simplified - no AI Browser in server mode)
    const mcpServers: Record<string, any> = {}

    // Build base SDK options
    const sdkOptions = buildBaseSdkOptions({
      credentials: resolvedCredentials,
      workDir,
      nodePath,
      spaceId,
      conversationId,
      abortController,
      stderrHandler: (data: string) => {
        console.error(`[Agent][${conversationId}] CLI stderr:`, data)
        stderrBuffer += data
      },
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : null,
      maxTurns: 50
    })

    // Apply thinking mode
    if (thinkingEnabled) {
      sdkOptions.maxThinkingTokens = 10240
    }

    const t0 = Date.now()
    console.log(`[Agent][${conversationId}] Getting or creating V2 session...`)

    // Session config for rebuild detection
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: !!aiBrowserEnabled
    }

    // Get or create V2 session
    const v2Session = await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig, workDir)

    // Register as active
    registerActiveSession(conversationId, sessionState)

    // Set dynamic params
    try {
      if (v2Session.setModel) {
        await v2Session.setModel(resolvedCredentials.sdkModel)
        console.log(`[Agent][${conversationId}] Model set: ${resolvedCredentials.sdkModel}`)
      }
      if (v2Session.setMaxThinkingTokens) {
        await v2Session.setMaxThinkingTokens(thinkingEnabled ? 10240 : null)
        console.log(`[Agent][${conversationId}] Thinking mode: ${thinkingEnabled ? 'ON (10240 tokens)' : 'OFF'}`)
      }
    } catch (e) {
      console.error(`[Agent][${conversationId}] Failed to set dynamic params:`, e)
    }
    console.log(`[Agent][${conversationId}] V2 session ready: ${Date.now() - t0}ms`)

    // Prepare message content
    const canvasPrefix = formatCanvasContext(canvasContext)
    const messageWithContext = canvasPrefix + message
    const messageContent = buildMessageContent(messageWithContext, images)

    // Process the stream
    await processStream({
      v2Session,
      sessionState,
      spaceId,
      conversationId,
      messageContent,
      displayModel: resolvedCredentials.displayModel,
      abortController,
      t0,
      requestId,  // Pass requestId for AI logging correlation
      callbacks: {
        onComplete: (streamResult) => {
          // Save session ID for future resumption
          if (streamResult.capturedSessionId) {
            saveSessionIdToDb(conversationId, streamResult.capturedSessionId)
            console.log(`[Agent][${conversationId}] Session ID saved:`, streamResult.capturedSessionId)
          }

          // Persist content to database
          const { finalContent, thoughts, tokenUsage, hasErrorThought, errorThought } = streamResult
          if (finalContent || hasErrorThought) {
            updateAssistantMessage(conversationId, {
              content: finalContent,
              thoughts: thoughts.length > 0 ? [...thoughts] : undefined,
              tokenUsage: tokenUsage || undefined,
              error: errorThought?.content
            })
          }
        }
      }
    })

  } catch (error: unknown) {
    const err = error as Error

    // Don't report abort as error
    if (err.name === 'AbortError') {
      console.log(`[Agent][${conversationId}] Aborted by user`)
      return
    }

    console.error(`[Agent][${conversationId}] Error:`, error)

    // Extract error message
    let errorMessage = err.message || `Unknown error. ${FALLBACK_ERROR_HINT}`

    // Try to extract error from stderr
    if (stderrBuffer && !errorMessage.includes('Command execution')) {
      const mcpErrorMatch = stderrBuffer.match(/Error: Invalid MCP configuration:[\s\S]*?(?=\n\s*at |$)/m)
      const genericErrorMatch = stderrBuffer.match(/Error: [\s\S]*?(?=\n\s*at |$)/m)
      if (mcpErrorMatch) {
        errorMessage = mcpErrorMatch[0].trim()
      } else if (genericErrorMatch) {
        errorMessage = genericErrorMatch[0].trim()
      }
    }

    sendToRenderer('agent:error', spaceId, conversationId, {
      type: 'error',
      error: errorMessage
    })

    // Persist error to database
    updateAssistantMessage(conversationId, {
      content: '',
      error: errorMessage
    })

    // Close V2 session on error
    closeV2Session(conversationId)
  } finally {
    // Clean up active session state
    unregisterActiveSession(conversationId)
    console.log(`[Agent][${conversationId}] Active session state cleaned up. V2 sessions: ${v2Sessions.size}`)
  }
}

// ============================================
// Database Helper Functions
// ============================================

function saveUserMessage(spaceId: string, conversationId: string, content: string, images?: any[]) {
  try {
    const db = getDatabase()
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any
    if (!conversation) return

    const messages = JSON.parse(conversation.messages || '[]')
    messages.push({
      id: crypto.randomUUID(),
      role: 'user',
      content,
      images: images || [],
      timestamp: Date.now()
    })

    db.prepare('UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(messages), Date.now(), conversationId)
  } catch (error) {
    console.error('[Agent] Failed to save user message:', error)
  }
}

function saveAssistantPlaceholder(spaceId: string, conversationId: string) {
  try {
    const db = getDatabase()
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any
    if (!conversation) return

    const messages = JSON.parse(conversation.messages || '[]')
    messages.push({
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      toolCalls: [],
      timestamp: Date.now()
    })

    db.prepare('UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(messages), Date.now(), conversationId)
  } catch (error) {
    console.error('[Agent] Failed to save assistant placeholder:', error)
  }
}

function updateAssistantMessage(conversationId: string, update: { content?: string, thoughts?: any[], tokenUsage?: any, error?: string }) {
  try {
    const db = getDatabase()
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any
    if (!conversation) return

    const messages = JSON.parse(conversation.messages || '[]')
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content = update.content || ''
      if (update.thoughts) lastMessage.thoughts = update.thoughts
      if (update.tokenUsage) lastMessage.tokenUsage = update.tokenUsage
      if (update.error) lastMessage.error = update.error
      lastMessage.timestamp = Date.now()
    }

    db.prepare('UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(messages), Date.now(), conversationId)
  } catch (error) {
    console.error('[Agent] Failed to update assistant message:', error)
  }
}

async function getSessionIdFromDb(conversationId: string): Promise<string | undefined> {
  try {
    const db = getDatabase()
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any
    return conversation?.sessionId
  } catch (error) {
    return undefined
  }
}

function saveSessionIdToDb(conversationId: string, sessionId: string) {
  try {
    const db = getDatabase()
    // Note: sessionId column may need to be added to conversations table
    // For now, we'll skip this
    console.log(`[Agent] Would save session ID ${sessionId} for conversation ${conversationId}`)
  } catch (error) {
    console.error('[Agent] Failed to save session ID:', error)
  }
}

// ============================================
// SSE Send Message
// ============================================

/**
 * SSE 版本的消息请求
 */
export interface AgentSSERequest {
  spaceId: string
  conversationId: string
  message: string
  images?: Array<{ mediaType: string; data: string }>
  aiBrowserEnabled?: boolean
  thinkingEnabled?: boolean
  canvasContext?: {
    isOpen: boolean
    tabCount: number
    activeTab?: string
    content?: string
  }
  /** SSE Writer */
  sseWriter: SseWriter
  /** Abort Controller */
  abortController: AbortController
}

/**
 * Send message to agent with SSE streaming response
 *
 * SSE 流式响应版本，用于 HTTP SSE 端点。
 * 同时通过 WebSocket 推送（双通道架构）。
 */
export async function sendMessageWithSSE(
  request: AgentSSERequest
): Promise<void> {
  const {
    spaceId,
    conversationId,
    message,
    images,
    aiBrowserEnabled,
    thinkingEnabled,
    canvasContext,
    sseWriter,
    abortController
  } = request

  console.log(`[Agent] sendMessageWithSSE: conv=${conversationId}${images && images.length > 0 ? `, images=${images.length}` : ''}${thinkingEnabled ? ', thinking=ON' : ''}`)

  // 生成唯一的 requestId
  const requestId = logUserMessage({
    spaceId,
    conversationId,
    messageContent: message,
    imageCount: images?.length || 0
  })

  const workDir = getWorkingDir(spaceId)

  // Accumulate stderr for detailed error messages
  let stderrBuffer = ''

  // Create session state
  const sessionState = createSessionState(spaceId, conversationId, abortController)

  // Save user message to database
  saveUserMessage(spaceId, conversationId, message, images)

  // Add placeholder for assistant response
  saveAssistantPlaceholder(spaceId, conversationId)

  try {
    // Get API credentials
    let credentials
    try {
      credentials = await getApiCredentials()
    } catch (credError: unknown) {
      const credErr = credError as Error
      logAiConfigError({
        conversationId,
        requestId,
        errorType: 'config_error',
        errorMessage: credErr.message || 'Failed to get API credentials'
      })
      throw credError
    }

    logAiConfig({
      conversationId,
      requestId,
      config: {
        provider: credentials.provider,
        model: credentials.model,
        displayModel: credentials.displayModel,
        baseUrl: credentials.baseUrl,
        apiType: credentials.apiType,
        customHeaders: credentials.customHeaders,
        forceStream: credentials.forceStream,
        filterContent: credentials.filterContent,
        apiKey: credentials.apiKey
      }
    })

    console.log(`[Agent][${conversationId}] SSE message: model=${credentials.displayModel}`)

    // Resolve credentials for SDK
    const resolvedCredentials = await resolveCredentialsForSdk(credentials)

    // Get session ID from database if resuming
    const sessionId = await getSessionIdFromDb(conversationId)

    // Use Node.js executable path
    const nodePath = getNodePath()

    // Build base SDK options
    const sdkOptions = buildBaseSdkOptions({
      credentials: resolvedCredentials,
      workDir,
      nodePath,
      spaceId,
      conversationId,
      abortController,
      stderrHandler: (data: string) => {
        console.error(`[Agent][${conversationId}] CLI stderr:`, data)
        stderrBuffer += data
      },
      mcpServers: null,
      maxTurns: 50
    })

    // Apply thinking mode
    if (thinkingEnabled) {
      sdkOptions.maxThinkingTokens = 10240
    }

    const t0 = Date.now()

    // Session config
    const sessionConfig: SessionConfig = {
      aiBrowserEnabled: !!aiBrowserEnabled
    }

    // Get or create V2 session
    const v2Session = await getOrCreateV2Session(spaceId, conversationId, sdkOptions, sessionId, sessionConfig, workDir)

    // Register as active
    registerActiveSession(conversationId, sessionState)

    // Set dynamic params
    try {
      if (v2Session.setModel) {
        await v2Session.setModel(resolvedCredentials.sdkModel)
      }
      if (v2Session.setMaxThinkingTokens) {
        await v2Session.setMaxThinkingTokens(thinkingEnabled ? 10240 : null)
      }
    } catch (e) {
      console.error(`[Agent][${conversationId}] Failed to set dynamic params:`, e)
    }

    console.log(`[Agent][${conversationId}] V2 session ready: ${Date.now() - t0}ms`)

    // Prepare message content
    const canvasPrefix = formatCanvasContext(canvasContext)
    const messageWithContext = canvasPrefix + message
    const messageContent = buildMessageContent(messageWithContext, images)

    // Process the stream with SSE writer
    await processStream({
      v2Session,
      sessionState,
      spaceId,
      conversationId,
      messageContent,
      displayModel: resolvedCredentials.displayModel,
      abortController,
      t0,
      requestId,
      sseWriter,  // Pass SSE writer for dual-channel streaming
      callbacks: {
        onComplete: (streamResult) => {
          // Save session ID
          if (streamResult.capturedSessionId) {
            saveSessionIdToDb(conversationId, streamResult.capturedSessionId)
          }

          // Persist content to database
          const { finalContent, thoughts, tokenUsage, hasErrorThought, errorThought } = streamResult
          if (finalContent || hasErrorThought) {
            updateAssistantMessage(conversationId, {
              content: finalContent,
              thoughts: thoughts.length > 0 ? [...thoughts] : undefined,
              tokenUsage: tokenUsage || undefined,
              error: errorThought?.content
            })
          }
        }
      }
    })

  } catch (error: unknown) {
    const err = error as Error

    // Don't report abort as error
    if (err.name === 'AbortError') {
      console.log(`[Agent][${conversationId}] Aborted by user`)
      return
    }

    console.error(`[Agent][${conversationId}] Error:`, error)

    // Extract error message
    let errorMessage = err.message || `Unknown error. ${FALLBACK_ERROR_HINT}`

    // Try to extract error from stderr
    if (stderrBuffer && !errorMessage.includes('Command execution')) {
      const mcpErrorMatch = stderrBuffer.match(/Error: Invalid MCP configuration:[\s\S]*?(?=\n\s*at |$)/m)
      const genericErrorMatch = stderrBuffer.match(/Error: [\s\S]*?(?=\n\s*at |$)/m)
      if (mcpErrorMatch) {
        errorMessage = mcpErrorMatch[0].trim()
      } else if (genericErrorMatch) {
        errorMessage = genericErrorMatch[0].trim()
      }
    }

    // Send error event via SSE
    if (!sseWriter.isClosed()) {
      sseWriter.writeEvent('error', {
        type: 'agent:error',
        spaceId,
        conversationId,
        error: errorMessage,
        errorType: 'unknown'
      })
    }

    // Persist error to database
    updateAssistantMessage(conversationId, {
      content: '',
      error: errorMessage
    })

    // Close V2 session on error
    closeV2Session(conversationId)
  } finally {
    // Clean up active session state
    unregisterActiveSession(conversationId)
    console.log(`[Agent][${conversationId}] SSE session cleaned up. V2 sessions: ${v2Sessions.size}`)
  }
}

// Import crypto for UUID generation
import { randomUUID as cryptoRandomUUID } from 'crypto'
const crypto = { randomUUID: cryptoRandomUUID }
