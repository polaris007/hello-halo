/**
 * Agent Module - Helper Functions
 *
 * Utility functions shared across the agent module.
 * Server-side version - removed Electron dependencies.
 */

import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import type { ApiCredentials } from './types'

// ============================================
// Working Directory Management
// ============================================

/**
 * Get the base data directory for Halo
 * In server mode, this is ~/.halo/
 */
export function getHaloDataDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd()
  return join(homeDir, '.halo')
}

/**
 * Get working directory for a space
 */
export function getWorkingDir(spaceId: string): string {
  console.log(`[Agent] getWorkingDir called with spaceId: ${spaceId}`)

  // For now, use a simple directory structure based on spaceId
  // In a full implementation, this would query the database for the space's working directory
  const haloDir = getHaloDataDir()
  const spacesDir = join(haloDir, 'spaces')
  const workDir = join(spacesDir, spaceId)

  if (!existsSync(workDir)) {
    mkdirSync(workDir, { recursive: true })
  }

  console.log(`[Agent] Resolved working dir: ${workDir}`)
  return workDir
}

// ============================================
// API Credentials
// ============================================

// Simple config cache
let configCache: any = null

/**
 * Get config from file
 * Server-side version - reads from ~/.halo/config.json
 */
async function getConfig(): Promise<any> {
  if (configCache) return configCache

  try {
    const configPath = join(getHaloDataDir(), 'config.json')
    if (existsSync(configPath)) {
      const configData = await import('fs').then(fs => fs.readFileSync(configPath, 'utf-8'))
      configCache = JSON.parse(configData)
      return configCache
    }
  } catch (error) {
    console.error('[Agent] Failed to read config:', error)
  }

  // Return default config
  return {}
}

/**
 * Get API credentials from config file
 * Server-side version - reads from config file
 */
export async function getApiCredentials(config?: any): Promise<ApiCredentials> {
  // If config is not provided, load it
  const cfg = config || await getConfig()

  // Try to get from config first
  const aiSources = cfg.aiSources
  if (aiSources?.version === 2 && aiSources.sources?.length > 0) {
    const currentSource = aiSources.sources.find((s: any) => s.id === aiSources.currentId) || aiSources.sources[0]

    if (currentSource) {
      const provider = currentSource.provider === 'anthropic' ? 'anthropic' :
                       currentSource.authType === 'oauth' ? 'oauth' : 'openai'

      return {
        baseUrl: currentSource.baseUrl || 'https://api.anthropic.com',
        apiKey: currentSource.apiKey || process.env.ANTHROPIC_API_KEY || '',
        model: currentSource.model || 'claude-sonnet-4-20250514',
        displayModel: currentSource.name || currentSource.model || 'Claude',
        provider,
        customHeaders: currentSource.customHeaders,
        apiType: currentSource.apiType,
        forceStream: currentSource.forceStream,
        filterContent: currentSource.filterContent
      }
    }
  }

  // Fallback to environment variables
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const apiKey = process.env.ANTHROPIC_API_KEY
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'

  if (!apiKey) {
    throw new Error('No API key configured. Please set ANTHROPIC_API_KEY environment variable or configure in settings.')
  }

  console.log(`[Agent] Using API: ${baseUrl}, model: ${model}`)

  return {
    baseUrl,
    apiKey,
    model,
    displayModel: model,
    provider: 'anthropic'
  }
}

/**
 * Get API credentials for a specific AI source (used for per-app model overrides).
 * Falls back to getApiCredentials() if the specified source is not found or not configured.
 */
export async function getApiCredentialsForSource(
  config: any,
  sourceId: string,
  modelId?: string
): Promise<ApiCredentials> {
  const cfg = config || await getConfig()
  const aiSources = cfg.aiSources

  if (aiSources?.version === 2) {
    const source = aiSources.sources.find((s: any) => s.id === sourceId)
    if (source) {
      const provider = source.provider === 'anthropic' ? 'anthropic' :
                       source.authType === 'oauth' ? 'oauth' : 'openai'

      return {
        baseUrl: source.baseUrl || 'https://api.anthropic.com',
        apiKey: source.apiKey || process.env.ANTHROPIC_API_KEY || '',
        model: modelId || source.model || 'claude-sonnet-4-20250514',
        displayModel: source.name || source.model || 'Claude',
        provider,
        customHeaders: source.customHeaders,
        apiType: source.apiType,
        forceStream: source.forceStream,
        filterContent: source.filterContent
      }
    }
  }

  // Fallback to default credentials
  return getApiCredentials(cfg)
}

/**
 * Infer OpenAI wire API type from URL or environment
 */
export function inferOpenAIWireApi(apiUrl: string): 'responses' | 'chat_completions' {
  // 1. Check environment variable override
  const envApiType = process.env.HALO_OPENAI_API_TYPE || process.env.HALO_OPENAI_WIRE_API
  if (envApiType) {
    const v = envApiType.toLowerCase()
    if (v.includes('response')) return 'responses'
    if (v.includes('chat')) return 'chat_completions'
  }
  // 2. Infer from URL
  if (apiUrl) {
    if (apiUrl.includes('/chat/completions') || apiUrl.includes('/chat_completions')) return 'chat_completions'
    if (apiUrl.includes('/responses')) return 'responses'
  }
  // 3. Default to chat_completions (most common for third-party providers)
  return 'chat_completions'
}

// ============================================
// MCP Server Filtering
// ============================================

/**
 * Filter out disabled MCP servers before passing to SDK
 */
export function getEnabledMcpServers(mcpServers: Record<string, any>): Record<string, any> | null {
  if (!mcpServers || Object.keys(mcpServers).length === 0) {
    return null
  }

  const enabled: Record<string, any> = {}
  for (const [name, config] of Object.entries(mcpServers)) {
    if (!config.disabled) {
      // Remove the 'disabled' field before passing to SDK (it's a Halo extension)
      const { disabled, ...sdkConfig } = config as any
      enabled[name] = sdkConfig
    }
  }

  return Object.keys(enabled).length > 0 ? enabled : null
}

// ============================================
// Renderer Communication (WebSocket)
// ============================================

// WebSocket service interface for agent communication
interface AgentWebSocketService {
  broadcastAgentEvent(eventType: string, data: any): void
  broadcastToAll(event: any): void
}

let websocketService: AgentWebSocketService | null = null

// Current main window reference (for compatibility with existing code)
let currentMainWindow: any = null

/**
 * Set the WebSocket service for broadcasting
 */
export function setWebSocketService(service: AgentWebSocketService): void {
  websocketService = service
}

/**
 * Set the current main window reference (server-side: no-op, for compatibility)
 */
export function setMainWindow(window: any): void {
  currentMainWindow = window
}

/**
 * Get the current main window reference (server-side: always null)
 */
export function getMainWindow(): any {
  return currentMainWindow
}

/**
 * Send event to renderer with session identifiers
 * Server-side version: broadcasts via WebSocket only
 */
export function sendToRenderer(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): void {
  // Always include spaceId and conversationId in event data
  const eventData = { ...data, spaceId, conversationId }

  // Broadcast via WebSocket to subscribed users
  if (websocketService) {
    try {
      websocketService.broadcastAgentEvent(channel, eventData)
    } catch (error) {
      console.error('[Agent] Failed to send WebSocket event:', error)
    }
  } else {
    console.warn('[Agent] WebSocket service not initialized, event dropped:', channel)
  }
}

/**
 * Broadcast event to all clients (global event, not conversation-scoped)
 */
export function broadcastToAllClients(channel: string, data: Record<string, unknown>): void {
  if (websocketService) {
    try {
      websocketService.broadcastToAll({
        type: channel,
        payload: data
      })
    } catch (error) {
      console.error('[Agent] Failed to broadcast event:', error)
    }
  }
}

// ============================================
// Node.js Path Management
// ============================================

/**
 * Get the path to Node.js executable
 * In server mode, this is just process.execPath
 */
export function getNodePath(): string {
  return process.execPath
}

// ============================================
// Config Directory
// ============================================

/**
 * Get Claude Config Directory
 * Server-side version uses ~/.halo/claude-config
 */
export function getClaudeConfigDir(): string {
  const haloDir = getHaloDataDir()
  const configDir = join(haloDir, 'claude-config')

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }

  return configDir
}

