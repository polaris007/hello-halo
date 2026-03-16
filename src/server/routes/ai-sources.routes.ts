/**
 * AI 提供商配置 API 路由
 */

import { Router } from 'express'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware'
import { getConfig, saveConfig } from '../services/config.service'
import { randomUUID } from 'crypto'

const router = Router()

// 公共接口：无需认证
// fetch-models 和 validate 允许未认证访问，因为这些接口用于配置AI模型，用户可能还没有登录
// 这些接口使用 optionalAuthMiddleware，不要求认证

/**
 * POST /api/v1/ai-sources/fetch-models - 从外部 API 获取可用模型列表
 * 通过服务端代理请求，避免浏览器 CORS 限制
 * 公共接口：完全公开，不要求任何认证
 */
router.post('/fetch-models', async (req, res) => {
  try {
    const { apiKey, apiUrl } = req.body

    if (!apiKey || !apiUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'API key and URL are required' }
      })
    }

    // Normalize URL: strip trailing slashes, known path suffixes, and auto-append /v1
    let baseUrl = apiUrl.replace(/\/+$/, '')
    const suffixes = ['/chat/completions', '/completions', '/responses', '/v1/chat']
    for (const suffix of suffixes) {
      if (baseUrl.endsWith(suffix)) {
        baseUrl = baseUrl.slice(0, -suffix.length)
        break
      }
    }

    if (!baseUrl.includes('/v1') && !baseUrl.includes('/api/paas')) {
      baseUrl = `${baseUrl}/v1`
    }

    const modelsUrl = `${baseUrl}/models`

    console.log('[AI Sources] Fetching models from:', modelsUrl)

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: { code: 'API_ERROR', message: `Failed to fetch models (${response.status})` }
      })
    }

    const data = await response.json()

    if (!data.data || !Array.isArray(data.data)) {
      return res.status(502).json({
        success: false,
        error: { code: 'INVALID_RESPONSE', message: 'Invalid API response format' }
      })
    }

    const models = data.data
      .filter((m: any) => typeof m.id === 'string')
      .map((m: any) => ({ id: m.id, name: m.id }))
      .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))

    console.log(`[AI Sources] Found ${models.length} models`)

    res.json({
      success: true,
      data: { models }
    })
  } catch (error: any) {
    const message = error.name === 'AbortError' || error.message?.includes('timeout')
      ? 'Connection timeout - server may be slow or unreachable'
      : error.message || 'Failed to fetch models'

    res.status(502).json({
      success: false,
      error: { code: 'FETCH_ERROR', message }
    })
  }
})

/**
 * POST /api/v1/ai-sources/validate - 测试 API 连接
 * 通过服务端发送轻量测试请求，验证 API Key、URL 和模型是否可用
 * 公共接口：完全公开，不要求任何认证
 */
router.post('/validate', async (req, res) => {
  try {
    const { apiKey, apiUrl, provider, model } = req.body

    if (!apiKey || !apiUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'API key and URL are required' }
      })
    }

    // Normalize URL
    let normalizedUrl = apiUrl.replace(/\/+$/, '')
    const suffixes = ['/chat/completions', '/completions', '/responses', '/v1/chat']
    for (const suffix of suffixes) {
      if (normalizedUrl.endsWith(suffix)) {
        normalizedUrl = normalizedUrl.slice(0, -suffix.length)
        break
      }
    }

    console.log('[AI Sources] Validating API connection:', normalizedUrl, 'provider:', provider)

    let testUrl: string
    let testBody: Record<string, unknown>
    let testHeaders: Record<string, string>

    if (provider === 'anthropic') {
      // Anthropic Messages API
      if (!normalizedUrl.includes('/v1')) {
        testUrl = `${normalizedUrl}/v1/messages`
      } else {
        testUrl = `${normalizedUrl}/messages`
      }
      testHeaders = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
      testBody = {
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      }
    } else {
      // OpenAI-compatible Chat Completions API
      if (!normalizedUrl.includes('/v1') && !normalizedUrl.includes('/api/paas')) {
        testUrl = `${normalizedUrl}/v1/chat/completions`
      } else {
        testUrl = `${normalizedUrl}/chat/completions`
      }
      testHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
      testBody = {
        model: model || 'gpt-4o-mini',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      }
    }

    console.log('[AI Sources] Testing endpoint:', testUrl)

    const response = await fetch(testUrl, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testBody),
      signal: AbortSignal.timeout(15000)
    })

    if (response.ok) {
      res.json({
        success: true,
        data: {
          valid: true,
          message: 'Connection successful',
          normalizedUrl,
          model: (testBody as any).model
        }
      })
    } else {
      const errorData = await response.text().catch(() => '')
      let userMessage = `Connection failed (${response.status})`

      if (response.status === 401) {
        userMessage = 'Invalid API key'
      } else if (response.status === 403) {
        userMessage = 'Access denied - check API key permissions'
      } else if (response.status === 404) {
        userMessage = 'API endpoint not found - check URL'
      } else if (response.status === 429) {
        userMessage = 'Rate limited - try again later'
      }

      res.json({
        success: true,
        data: {
          valid: false,
          message: userMessage,
          normalizedUrl
        }
      })
    }
  } catch (error: any) {
    let message = error.message || 'Connection failed'

    if (error.name === 'AbortError' || message.includes('timeout')) {
      message = 'Connection timeout - server may be slow or unreachable'
    } else if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) {
      message = 'Cannot connect to API server - check URL'
    }

    res.json({
      success: true,
      data: {
        valid: false,
        message
      }
    })
  }
})

// 从这之后的所有接口都需要认证
// router.use(authMiddleware)  // 暂时注释掉，测试 fetch-models 接口

/**
 * GET /api/v1/ai-sources/providers - 获取所有 AI 提供商
 */
router.get('/providers', (req, res) => {
  try {
    const config = getConfig()

    // 不返回 API Key 敏感信息
    const providers = config.aiSources.providers.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      hasApiKey: !!p.apiKey
    }))

    res.json({
      success: true,
      data: providers
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/ai-sources/providers/:id - 获取单个 AI 提供商详情
 */
router.get('/providers/:id', (req, res) => {
  try {
    const config = getConfig()
    const provider = config.aiSources.providers.find(p => p.id === req.params.id)

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'AI 提供商不存在' }
      })
    }

    // 不返回 API Key 敏感信息
    res.json({
      success: true,
      data: {
        id: provider.id,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        hasApiKey: !!provider.apiKey
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/ai-sources/providers - 添加 AI 提供商
 */
router.post('/providers', (req, res) => {
  try {
    const { id, name, type, apiKey, baseUrl } = req.body

    if (!id || !name || !type) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要字段' }
      })
    }

    const config = getConfig()

    // 检查是否已存在
    const exists = config.aiSources.providers.some(p => p.id === id)
    if (exists) {
      return res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: 'AI 提供商已存在' }
      })
    }

    // 添加新提供商
    config.aiSources.providers.push({
      id,
      name,
      type,
      apiKey: apiKey || '',
      baseUrl: baseUrl || ''
    })

    saveConfig(config)

    res.status(201).json({
      success: true,
      data: {
        id,
        name,
        type,
        baseUrl: baseUrl || '',
        hasApiKey: !!apiKey
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/ai-sources/providers/:id - 更新 AI 提供商
 */
router.put('/providers/:id', (req, res) => {
  try {
    const { name, type, apiKey, baseUrl } = req.body
    const providerId = req.params.id

    const config = getConfig()
    const providerIndex = config.aiSources.providers.findIndex(p => p.id === providerId)

    if (providerIndex === -1) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'AI 提供商不存在' }
      })
    }

    // 更新提供商信息
    const provider = config.aiSources.providers[providerIndex]
    if (name !== undefined) provider.name = name
    if (type !== undefined) provider.type = type
    if (apiKey !== undefined) provider.apiKey = apiKey
    if (baseUrl !== undefined) provider.baseUrl = baseUrl

    saveConfig(config)

    res.json({
      success: true,
      data: {
        id: providerId,
        name: provider.name,
        type: provider.type,
        baseUrl: provider.baseUrl,
        hasApiKey: !!provider.apiKey
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/ai-sources/providers/:id - 删除 AI 提供商
 */
router.delete('/providers/:id', (req, res) => {
  try {
    const providerId = req.params.id

    const config = getConfig()
    const providerIndex = config.aiSources.providers.findIndex(p => p.id === providerId)

    if (providerIndex === -1) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'AI 提供商不存在' }
      })
    }

    // 删除提供商
    config.aiSources.providers.splice(providerIndex, 1)
    saveConfig(config)

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/ai-sources/switch - 切换当前使用的 AI 提供商
 */
router.post('/switch', (req, res) => {
  try {
    const { sourceId } = req.body

    if (!sourceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'AI 提供商 ID 不能为空' }
      })
    }

    const config = getConfig()
    const provider = config.aiSources.providers.find(p => p.id === sourceId)

    if (!provider) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'AI 提供商不存在' }
      })
    }

    // 保存当前选择的 AI 提供商到用户配置
    // TODO: 实现用户级别的 AI 提供商选择

    res.json({
      success: true,
      data: {
        currentProvider: sourceId
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/ai-sources/models - 获取可用模型列表
 */
router.get('/models', (req, res) => {
  try {
    const config = getConfig()

    // 返回所有提供商的模型列表
    // TODO: 从各提供商 API 获取实际可用模型
    const models = config.aiSources.providers.flatMap(provider => {
      if (!provider.apiKey) return []

      // 根据提供商类型返回预定义模型列表
      switch (provider.type) {
        case 'anthropic':
          return [
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: provider.id },
            { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: provider.id },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: provider.id }
          ]
        case 'openai':
          return [
            { id: 'gpt-4o', name: 'GPT-4o', provider: provider.id },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: provider.id },
            { id: 'o1-preview', name: 'o1 Preview', provider: provider.id }
          ]
        default:
          return []
      }
    })

    res.json({
      success: true,
      data: models
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

// ============================================================================
// V2 AI Sources API - 混合存储：API-Key 源在文件中，OAuth 源在数据库中
// ============================================================================

import { getDatabase } from '../utils/database'
import { clearConfigCache } from '../services/agent/helpers'
import type { AISource, AISourcesConfig } from '../../shared/types/ai-sources'
import { createSource, addSource, updateSource, deleteSource, setCurrentSource, setCurrentModel, createEmptyAISourcesConfig } from '../../shared/types/ai-sources'
import {
  LLMConfigSource,
  createEmptyLLMConfigFile,
  validateLLMConfigSource
} from '../../shared/types/llm-config'
import {
  getLLMConfig,
  saveLLMConfig,
  addLLMSource,
  updateLLMSource,
  deleteLLMSource,
  setCurrentLLMSource,
  getCurrentLLMSourceFromConfig,
  clearLLMConfigCache
} from '../services/llm-config.service'

const AI_SOURCES_KEY = 'aiSources'

/**
 * Get aiSources config from database for current user
 */
function getUserAISources(userId: string): AISourcesConfig {
  const db = getDatabase()
  const row = db.prepare('SELECT value FROM configs WHERE user_id = ? AND key = ?').get(userId, AI_SOURCES_KEY) as any
  if (row) {
    try {
      return JSON.parse(row.value)
    } catch {
      return createEmptyAISourcesConfig()
    }
  }
  return createEmptyAISourcesConfig()
}

/**
 * Save aiSources config to database for current user
 */
function saveUserAISources(userId: string, config: AISourcesConfig): void {
  const db = getDatabase()
  const now = Date.now()
  const value = JSON.stringify(config)

  const existing = db.prepare('SELECT id FROM configs WHERE user_id = ? AND key = ?').get(userId, AI_SOURCES_KEY) as any
  if (existing) {
    db.prepare('UPDATE configs SET value = ?, updated_at = ? WHERE user_id = ? AND key = ?')
      .run(value, now, userId, AI_SOURCES_KEY)
  } else {
    db.prepare('INSERT INTO configs (id, user_id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), userId, AI_SOURCES_KEY, value, now, now)
  }

  // Clear agent config cache so next request picks up new config
  clearConfigCache()
}

/**
 * Merge file config with database config
 * For API-Key sources, enriches database metadata with file-stored sensitive data
 */
function mergeAISourcesWithFileConfig(dbConfig: AISourcesConfig): AISourcesConfig {
  const llmConfig = getLLMConfig()
  const mergedSources: AISource[] = []

  for (const dbSource of dbConfig.sources) {
    if (dbSource.authType === 'api-key') {
      // Find corresponding file source
      const fileSource = llmConfig.sources.find(s => s.id === dbSource.id)
      if (fileSource) {
        // Merge file data into db source
        mergedSources.push({
          ...dbSource,
          apiKey: fileSource.apiKey,
          apiUrl: fileSource.apiUrl,
          model: fileSource.model,
          availableModels: fileSource.availableModels,
          apiType: fileSource.apiType
        })
      } else {
        // File source not found, use db source as-is
        mergedSources.push(dbSource)
      }
    } else {
      // OAuth source, use db source as-is
      mergedSources.push(dbSource)
    }
  }

  // Add any API-Key sources from file that are not in database
  for (const fileSource of llmConfig.sources) {
    if (!dbConfig.sources.some(s => s.id === fileSource.id)) {
      mergedSources.push({
        id: fileSource.id,
        name: fileSource.name,
        provider: fileSource.provider,
        authType: 'api-key',
        apiUrl: fileSource.apiUrl,
        apiKey: fileSource.apiKey,
        apiType: fileSource.apiType,
        model: fileSource.model,
        availableModels: fileSource.availableModels,
        createdAt: fileSource.createdAt,
        updatedAt: fileSource.updatedAt
      })
    }
  }

  return {
    ...dbConfig,
    sources: mergedSources
  }
}

/**
 * POST /api/v1/ai-sources/sources - 添加 AI Source (v2)
 * API-Key sources are stored in llm-config.json file
 * OAuth sources are stored in database
 */
router.post('/sources', (req, res) => {
  try {
    const sourceData = req.body as AISource

    if (!sourceData.name || !sourceData.provider || !sourceData.model) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Missing required fields' }
      })
    }

    // Create source object
    const newSource = createSource({
      name: sourceData.name,
      provider: sourceData.provider,
      authType: sourceData.authType,
      apiUrl: sourceData.apiUrl,
      apiKey: sourceData.apiKey,
      accessToken: sourceData.accessToken,
      refreshToken: sourceData.refreshToken,
      tokenExpires: sourceData.tokenExpires,
      user: sourceData.user,
      model: sourceData.model,
      availableModels: sourceData.availableModels || []
    })

    // Store based on auth type
    if (sourceData.authType === 'api-key') {
      // Store in file
      const llmSource: LLMConfigSource = {
        id: newSource.id,
        name: newSource.name,
        provider: newSource.provider,
        apiUrl: newSource.apiUrl,
        apiKey: newSource.apiKey || '',
        apiType: newSource.apiType,
        model: newSource.model,
        availableModels: newSource.availableModels,
        createdAt: newSource.createdAt,
        updatedAt: newSource.updatedAt
      }

      const result = addLLMSource(llmSource)
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { code: 'SAVE_FAILED', message: result.error }
        })
      }

      // Also add to database for metadata (without sensitive data)
      const dbConfig = getUserAISources(req.userId!)
      const dbSource = createSource({
        name: newSource.name,
        provider: newSource.provider,
        authType: 'api-key',
        apiUrl: newSource.apiUrl,
        apiKey: '', // Don't store in database
        model: newSource.model,
        availableModels: newSource.availableModels
      })
      const newDbConfig = addSource(dbConfig, dbSource)
      saveUserAISources(req.userId!, newDbConfig)

      res.json({
        success: true,
        data: newDbConfig
      })
    } else {
      // OAuth source - store in database only
      const config = getUserAISources(req.userId!)
      const newConfig = addSource(config, newSource)
      saveUserAISources(req.userId!, newConfig)

      res.json({
        success: true,
        data: newConfig
      })
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/ai-sources/sources/:id - 更新 AI Source (v2)
 * API-Key sources are stored in llm-config.json file
 * OAuth sources are stored in database
 */
router.put('/sources/:id', (req, res) => {
  try {
    const sourceId = req.params.id
    const updates = req.body as Partial<AISource>

    // First check if this is an API-Key source in file
    const llmConfig = getLLMConfig()
    const llmSource = llmConfig.sources.find(s => s.id === sourceId)

    if (llmSource) {
      // Update in file
      const llmUpdates: Partial<LLMConfigSource> = {}
      if (updates.name !== undefined) llmUpdates.name = updates.name
      if (updates.apiUrl !== undefined) llmUpdates.apiUrl = updates.apiUrl
      if (updates.apiKey !== undefined) llmUpdates.apiKey = updates.apiKey
      if (updates.model !== undefined) llmUpdates.model = updates.model
      if (updates.availableModels !== undefined) llmUpdates.availableModels = updates.availableModels
      if (updates.apiType !== undefined) llmUpdates.apiType = updates.apiType

      const result = updateLLMSource(sourceId, llmUpdates)
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { code: 'UPDATE_FAILED', message: result.error }
        })
      }

      // Also update database metadata (without sensitive data)
      const dbConfig = getUserAISources(req.userId!)
      const dbUpdates: Partial<AISource> = {}
      if (updates.name !== undefined) dbUpdates.name = updates.name
      if (updates.apiUrl !== undefined) dbUpdates.apiUrl = updates.apiUrl
      if (updates.model !== undefined) dbUpdates.model = updates.model
      if (updates.availableModels !== undefined) dbUpdates.availableModels = updates.availableModels
      if (updates.apiType !== undefined) dbUpdates.apiType = updates.apiType

      const newDbConfig = updateSource(dbConfig, sourceId, dbUpdates)
      saveUserAISources(req.userId!, newDbConfig)

      res.json({
        success: true,
        data: newDbConfig
      })
    } else {
      // OAuth source or not found in file - update in database
      const config = getUserAISources(req.userId!)
      const newConfig = updateSource(config, sourceId, updates)
      saveUserAISources(req.userId!, newConfig)

      res.json({
        success: true,
        data: newConfig
      })
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/ai-sources/sources/:id - 删除 AI Source (v2)
 * API-Key sources are stored in llm-config.json file
 * OAuth sources are stored in database
 */
router.delete('/sources/:id', (req, res) => {
  try {
    const sourceId = req.params.id

    // First check if this is an API-Key source in file
    const llmConfig = getLLMConfig()
    const llmSource = llmConfig.sources.find(s => s.id === sourceId)

    if (llmSource) {
      // Delete from file
      const result = deleteLLMSource(sourceId)
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { code: 'DELETE_FAILED', message: result.error }
        })
      }

      // Also delete from database metadata
      const dbConfig = getUserAISources(req.userId!)
      const newDbConfig = deleteSource(dbConfig, sourceId)
      saveUserAISources(req.userId!, newDbConfig)

      res.json({
        success: true,
        data: newDbConfig
      })
    } else {
      // OAuth source or not found in file - delete from database
      const config = getUserAISources(req.userId!)
      const newConfig = deleteSource(config, sourceId)
      saveUserAISources(req.userId!, newConfig)

      res.json({
        success: true,
        data: newConfig
      })
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/ai-sources/switch-source - 切换当前 AI Source (v2)
 * Updates currentId in both file (for API-Key) and database (for OAuth)
 */
router.post('/switch-source', (req, res) => {
  try {
    const { sourceId } = req.body

    if (!sourceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Source ID is required' }
      })
    }

    // Check if source exists in file
    const llmConfig = getLLMConfig()
    const llmSource = llmConfig.sources.find(s => s.id === sourceId)

    if (llmSource) {
      // Set as current in file
      const result = setCurrentLLMSource(sourceId)
      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: { code: 'SWITCH_FAILED', message: result.error }
        })
      }
    }

    // Also update database
    const config = getUserAISources(req.userId!)
    const newConfig = setCurrentSource(config, sourceId)
    saveUserAISources(req.userId!, newConfig)

    res.json({
      success: true,
      data: newConfig
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/ai-sources/set-model - 设置当前模型 (v2)
 */
router.post('/set-model', (req, res) => {
  try {
    const { modelId } = req.body

    if (!modelId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Model ID is required' }
      })
    }

    const config = getUserAISources(req.userId!)
    const newConfig = setCurrentModel(config, modelId)
    saveUserAISources(req.userId!, newConfig)

    res.json({
      success: true,
      data: newConfig
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/ai-sources/file-config - 获取文件配置 (llm-config.json)
 * Returns the LLM config file content for API-key sources
 */
router.get('/file-config', (req, res) => {
  try {
    const config = getLLMConfig()

    // Return config without exposing API keys in the response
    // (API keys are still stored in the file, just not returned to frontend)
    const safeConfig = {
      version: config.version,
      currentId: config.currentId,
      sources: config.sources.map(s => ({
        id: s.id,
        name: s.name,
        provider: s.provider,
        apiUrl: s.apiUrl,
        model: s.model,
        availableModels: s.availableModels,
        apiType: s.apiType,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        // Note: apiKey is NOT included in the response for security
        hasApiKey: !!s.apiKey
      }))
    }

    res.json({
      success: true,
      data: safeConfig
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/ai-sources/file-config/full - 获取完整文件配置 (包括 API Key)
 * Returns the full LLM config file content including API keys
 * Use with caution - only for editing operations
 */
router.get('/file-config/full', (req, res) => {
  try {
    const config = getLLMConfig()

    res.json({
      success: true,
      data: config
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/ai-sources/migrate - 迁移数据库配置到文件
 * Migrates API-Key sources from database to llm-config.json file
 */
router.post('/migrate', async (req, res) => {
  try {
    const { checkOnly } = req.body

    // Get database sources
    const dbConfig = getUserAISources(req.userId!)
    const dbSources = dbConfig.sources

    // Import migration functions
    const { needsMigration, migrateFromDatabase } = await import('../services/llm-config.service')

    if (!needsMigration(dbSources)) {
      return res.json({
        success: true,
        data: {
          migrated: false,
          migratedCount: 0,
          message: 'No migration needed'
        }
      })
    }

    if (checkOnly) {
      return res.json({
        success: true,
        data: {
          migrated: false,
          migratedCount: 0,
          migrationNeeded: true,
          message: 'Migration is needed'
        }
      })
    }

    // Perform migration
    const result = migrateFromDatabase(dbSources, dbConfig.currentId)

    res.json({
      success: result.success,
      data: {
        migrated: true,
        migratedCount: result.migratedCount,
        errors: result.errors
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
