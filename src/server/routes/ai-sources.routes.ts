/**
 * AI 提供商配置 API 路由
 */

import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import { getConfig, saveConfig } from '../services/config.service'

const router = Router()

// 所有 AI 提供商 API 都需要认证
router.use(authMiddleware)

/**
 * POST /api/v1/ai-sources/fetch-models - 从外部 API 获取可用模型列表
 * 通过服务端代理请求，避免浏览器 CORS 限制
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

export { router }
