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

export { router }
