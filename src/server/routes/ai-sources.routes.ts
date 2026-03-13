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
