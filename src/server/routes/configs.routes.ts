/**
 * 配置管理 API 路由
 */

import { Router } from 'express'
import { getDatabase } from '../utils/database'
import { authMiddleware } from '../middleware/auth.middleware'
import { randomUUID } from 'crypto'

const router = Router()

// 所有配置 API 都需要认证
router.use(authMiddleware)

/**
 * GET /api/v1/configs - 获取当前用户的所有配置
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase()
    const configs = db.prepare(`
      SELECT key, value, created_at, updated_at
      FROM configs
      WHERE user_id = ?
    `).all(req.userId)

    // 转换为键值对格式
    const configMap: Record<string, any> = {}
    for (const config of configs as any[]) {
      configMap[config.key] = config.value
    }

    res.json({
      success: true,
      data: configMap
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/configs/:key - 获取单个配置项
 */
router.get('/:key', (req, res) => {
  try {
    const db = getDatabase()
    const config = db.prepare(`
      SELECT key, value, created_at, updated_at
      FROM configs
      WHERE key = ? AND user_id = ?
    `).get(req.params.key, req.userId) as any

    if (!config) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '配置项不存在' }
      })
    }

    res.json({
      success: true,
      data: {
        [config.key]: config.value
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
 * PUT /api/v1/configs/:key - 更新或创建配置项
 */
router.put('/:key', (req, res) => {
  try {
    const { value } = req.body
    const key = req.params.key

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '配置值不能为空' }
      })
    }

    const db = getDatabase()
    const now = Date.now()

    // 检查配置是否存在
    const existing = db.prepare('SELECT * FROM configs WHERE key = ? AND user_id = ?').get(key, req.userId)

    if (existing) {
      // 更新现有配置
      db.prepare(`
        UPDATE configs
        SET value = ?, updated_at = ?
        WHERE key = ? AND user_id = ?
      `).run(JSON.stringify(value), now, key, req.userId)
    } else {
      // 创建新配置
      db.prepare(`
        INSERT INTO configs (id, user_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), req.userId, key, JSON.stringify(value), now, now)
    }

    res.json({
      success: true,
      data: {
        key,
        value
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
 * DELETE /api/v1/configs/:key - 删除配置项
 */
router.delete('/:key', (req, res) => {
  try {
    const db = getDatabase()
    const result = db.prepare('DELETE FROM configs WHERE key = ? AND user_id = ?').run(req.params.key, req.userId)

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '配置项不存在' }
      })
    }

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
 * GET /api/v1/configs/ai-provider - Get AI provider configuration
 */
router.get('/ai-provider', (req, res) => {
  try {
    const db = getDatabase()
    const config = db.prepare(`
      SELECT value FROM configs
      WHERE key = 'ai-provider' AND user_id = ?
    `).get(req.userId) as any

    if (!config) {
      // Return default empty config
      return res.json({
        success: true,
        data: {
          provider: null,
          apiKey: null,
          apiUrl: null,
          model: null
        }
      })
    }

    const value = JSON.parse(config.value)
    res.json({
      success: true,
      data: value
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/configs/ai-provider - Update AI provider configuration
 */
router.put('/ai-provider', (req, res) => {
  try {
    const { provider, apiKey, apiUrl, model } = req.body
    const db = getDatabase()
    const now = Date.now()

    const configValue = JSON.stringify({
      provider,
      apiKey,
      apiUrl,
      model
    })

    // Check if config exists
    const existing = db.prepare('SELECT * FROM configs WHERE key = ? AND user_id = ?').get('ai-provider', req.userId)

    if (existing) {
      db.prepare(`
        UPDATE configs
        SET value = ?, updated_at = ?
        WHERE key = ? AND user_id = ?
      `).run(configValue, now, 'ai-provider', req.userId)
    } else {
      db.prepare(`
        INSERT INTO configs (id, user_id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), req.userId, 'ai-provider', configValue, now, now)
    }

    res.json({
      success: true,
      data: { provider, apiKey, apiUrl, model }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/configs/ai-provider/test - Test AI provider connection
 */
router.post('/ai-provider/test', async (req, res) => {
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

    let testUrl: string
    let testBody: Record<string, unknown>
    let testHeaders: Record<string, string>

    if (provider === 'anthropic') {
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
          message: 'Connection successful'
        }
      })
    } else {
      const userMessage = response.status === 401 ? 'Invalid API key' :
        response.status === 403 ? 'Access denied' :
        response.status === 404 ? 'API endpoint not found' :
        response.status === 429 ? 'Rate limited' :
        `Connection failed (${response.status})`

      res.json({
        success: true,
        data: {
          valid: false,
          message: userMessage
        }
      })
    }
  } catch (error: any) {
    let message = error.message || 'Connection failed'
    if (error.name === 'AbortError' || message.includes('timeout')) {
      message = 'Connection timeout'
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

export { router }
