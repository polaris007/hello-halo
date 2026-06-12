/**
 * Agent Module - MCP Manager
 *
 * Manages MCP (Model Context Protocol) server status including
 * caching, broadcasting, and connection testing.
 * Server-side version - removed Electron dependencies.
 */

import { query } from './resolved-sdk.js'
import type { McpServerStatusInfo } from './types.js'
import {
  getNodePath,
  getApiCredentials,
  getEnabledMcpServers,
  inferOpenAIWireApi,
  broadcastToAllClients
} from './helpers.js'
import { getCleanUserEnv } from './sdk-config.js'

// ============================================
// MCP Status Cache
// ============================================

// Cached MCP status - updated when SDK reports status during conversation
let cachedMcpStatus: McpServerStatusInfo[] = []
let lastMcpStatusUpdate: number = 0

/**
 * Get cached MCP status
 */
export function getCachedMcpStatus(): McpServerStatusInfo[] {
  return cachedMcpStatus
}

/**
 * Get last MCP status update timestamp
 */
export function getLastMcpStatusUpdate(): number {
  return lastMcpStatusUpdate
}

// ============================================
// MCP Status Broadcasting
// ============================================

/**
 * Broadcast MCP status to all renderers (global, not conversation-specific)
 */
export function broadcastMcpStatus(mcpServers: Array<{ name: string; status: string }>): void {
  // Convert to our status type
  cachedMcpStatus = mcpServers.map(s => ({
    name: s.name,
    status: s.status as McpServerStatusInfo['status']
  }))
  lastMcpStatusUpdate = Date.now()

  const eventData = {
    servers: cachedMcpStatus,
    timestamp: lastMcpStatusUpdate
  }

  // Broadcast to all clients via WebSocket
  broadcastToAllClients('agent:mcp-status', eventData)
  console.log(`[Agent] Broadcast MCP status: ${cachedMcpStatus.length} servers`)
}

// ============================================
// MCP Connection Testing
// ============================================

// Test MCP connections flag to prevent concurrent tests
let mcpTestInProgress = false

/**
 * Test MCP connections manually
 * Starts a temporary SDK query just to get MCP status
 */
export async function testMcpConnections(): Promise<{ success: boolean; servers: McpServerStatusInfo[]; error?: string }> {
  if (mcpTestInProgress) {
    return { success: false, servers: cachedMcpStatus, error: 'Test already in progress' }
  }

  mcpTestInProgress = true
  console.log('[Agent] Starting MCP connection test...')

  try {
    // Get API credentials
    const credentials = await getApiCredentials()
    if (!credentials.apiKey && credentials.provider !== 'oauth') {
      return { success: false, servers: [], error: 'API key not configured' }
    }

    // Get enabled MCP servers from config
    const config = await getMcpConfig()
    const enabledMcpServers = getEnabledMcpServers(config.mcpServers || {})
    if (!enabledMcpServers || Object.keys(enabledMcpServers).length === 0) {
      return { success: true, servers: [], error: 'No MCP servers configured' }
    }

    console.log('[Agent] MCP servers to test:', Object.keys(enabledMcpServers).join(', '))

    // Use a temp directory for the query
    const { getHelloDataDir } = await import('./helpers.js')
    const path = await import('path')
    const cwd = path.join(getHelloDataDir(), 'temp')
    const { mkdirSync, existsSync } = await import('fs')
    if (!existsSync(cwd)) {
      mkdirSync(cwd, { recursive: true })
    }

    // Use Node.js executable path
    const nodePath = getNodePath()

    // Route through OpenAI compat router for non-Anthropic providers
    let anthropicBaseUrl = credentials.baseUrl
    let anthropicApiKey = credentials.apiKey
    let sdkModel = credentials.model || 'claude-sonnet-4-20250514'

    // For non-Anthropic providers, we'd need to use the router
    // For simplicity, we'll use direct connection here
    if (credentials.provider !== 'anthropic') {
      // This would need the OpenAI compat router
      console.log(`[Agent] MCP test: ${credentials.provider} provider - using direct connection`)
    }

    console.log('[Agent] MCP test config:', JSON.stringify(enabledMcpServers, null, 2))

    // Create query with proper configuration
    const abortController = new AbortController()
    const queryIterator = query({
      prompt: 'hi', // Simple prompt to trigger MCP connection
      options: {
        apiKey: anthropicApiKey,
        model: sdkModel,
        anthropicBaseUrl,
        cwd,
        executable: nodePath,
        executableArgs: ['--no-warnings'],
        env: {
          ...getCleanUserEnv(),
          ANTHROPIC_API_KEY: anthropicApiKey,
          ANTHROPIC_BASE_URL: anthropicBaseUrl,
          NO_PROXY: 'localhost,127.0.0.1',
          no_proxy: 'localhost,127.0.0.1',
          // Disable unnecessary API requests
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
          DISABLE_TELEMETRY: '1',
          DISABLE_COST_WARNINGS: '1'
        },
        permissionMode: 'bypassPermissions',
        abortController,
        mcpServers: enabledMcpServers,
        maxTurns: 1  // Only need one turn to get MCP status
      } as any
    })

    // Iterate through messages looking for system message with MCP status
    let foundStatus = false
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        abortController.abort()
        reject(new Error('MCP test timeout'))
      }, 30000) // 30s timeout
    })

    const iteratePromise = (async () => {
      for await (const msg of queryIterator) {
        console.log('[Agent] MCP test received msg type:', msg.type)

        // Check for system message which contains MCP status
        if (msg.type === 'system') {
          const mcpServers = (msg as any).mcp_servers as Array<{ name: string; status: string }> | undefined
          console.log('[Agent] MCP test mcp_servers field:', mcpServers)

          if (mcpServers) {
            console.log('[Agent] MCP test got status:', JSON.stringify(mcpServers))
            broadcastMcpStatus(mcpServers)
            foundStatus = true
          }
          // After getting system message with MCP status, abort to save resources
          abortController.abort()
          break
        }

        // If we get a result before system message, something is wrong
        if (msg.type === 'result') {
          break
        }
      }
    })()

    try {
      await Promise.race([iteratePromise, timeoutPromise])
    } catch (e) {
      // Ignore abort errors, they're expected
      if ((e as Error).name !== 'AbortError') {
        throw e
      }
    }

    if (foundStatus) {
      return { success: true, servers: cachedMcpStatus }
    } else {
      return { success: true, servers: [], error: 'No MCP status received from SDK' }
    }
  } catch (error) {
    const err = error as Error
    console.error('[Agent] MCP test error:', err)
    return { success: false, servers: cachedMcpStatus, error: err.message }
  } finally {
    mcpTestInProgress = false
  }
}

/**
 * Check if MCP test is currently in progress
 */
export function isMcpTestInProgress(): boolean {
  return mcpTestInProgress
}

// Helper function to get MCP config from file
async function getMcpConfig(): Promise<any> {
  try {
    const { join } = await import('path')
    const { readFileSync, existsSync } = await import('fs')
    const { resolveDataDir } = await import('../config.service.js')
    const dataDir = resolveDataDir()
    const configPath = join(dataDir, 'config.json')
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    }
  } catch (error) {
    console.error('[Agent] Failed to read MCP config:', error)
  }
  return {}
}
