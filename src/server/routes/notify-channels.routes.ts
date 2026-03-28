/**
 * 通知渠道 API 路由
 * 提供通知渠道的配置和测试功能
 */

import { Router, Request, Response } from 'express'
import { legacyAuthMiddleware } from '../middleware/auth.middleware.js'
import { getDatabase } from '../utils/database.js'
import { randomUUID } from 'crypto'

const router = Router()

// 所有通知渠道 API 都需要认证
router.use(legacyAuthMiddleware)

/**
 * GET /api/v1/notify-channels - 获取通知渠道列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase()

    const channels = db.prepare(`
      SELECT * FROM notification_channels WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.userId)

    res.json({
      success: true,
      data: channels
    })
  } catch (error: any) {
    console.error('List notification channels error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/notify-channels - 创建通知渠道
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, name, config } = req.body

    if (!type || !name) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    const db = getDatabase()
    const id = randomUUID()
    const now = Date.now()

    db.prepare(`
      INSERT INTO notification_channels (id, user_id, type, name, config, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, req.userId, type, name, JSON.stringify(config), now, now)

    res.status(201).json({
      success: true,
      data: {
        id,
        type,
        name,
        enabled: true
      }
    })
  } catch (error: any) {
    console.error('Create notification channel error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/notify-channels/:id - 更新通知渠道
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { name, config, enabled } = req.body

    const db = getDatabase()

    const channel = db.prepare('SELECT * FROM notification_channels WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '通知渠道不存在' }
      })
    }

    db.prepare(`
      UPDATE notification_channels
      SET name = ?, config = ?, enabled = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      name || (channel as any).name,
      config !== undefined ? JSON.stringify(config) : (channel as any).config,
      enabled !== undefined ? (enabled ? 1 : 0) : (channel as any).enabled,
      Date.now(),
      id,
      req.userId
    )

    res.json({
      success: true,
      data: {
        id,
        name: name || (channel as any).name,
        enabled: enabled !== undefined ? enabled : (channel as any).enabled
      }
    })
  } catch (error: any) {
    console.error('Update notification channel error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/notify-channels/:id - 删除通知渠道
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const channel = db.prepare('SELECT * FROM notification_channels WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '通知渠道不存在' }
      })
    }

    db.prepare('DELETE FROM notification_channels WHERE id = ? AND user_id = ?').run(id, req.userId)

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    console.error('Delete notification channel error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/notify-channels/test - 测试通知渠道
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { channelType, channelId } = req.body

    if (!channelType) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '通知类型不能为空' }
      })
    }

    const db = getDatabase()

    // 获取渠道配置
    let channel
    if (channelId) {
      channel = db.prepare('SELECT * FROM notification_channels WHERE id = ? AND user_id = ?').get(channelId, req.userId)
    } else {
      // 获取第一个指定类型的渠道
      channel = db.prepare('SELECT * FROM notification_channels WHERE type = ? AND user_id = ? LIMIT 1').get(channelType, req.userId)
    }

    if (!channel) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '通知渠道不存在' }
      })
    }

    // TODO: 实现实际的测试通知发送逻辑
    // 根据渠道类型发送邮件、Webhook、企业微信等测试消息

    res.json({
      success: true,
      data: {
        sent: true,
        channelType,
        channelId: (channel as any).id
      }
    })
  } catch (error: any) {
    console.error('Test notification channel error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/notify-channels/clear-cache - 清除通知渠道缓存
 */
router.post('/clear-cache', async (req: Request, res: Response) => {
  try {
    // TODO: 实现缓存清除逻辑

    res.json({
      success: true,
      data: { cleared: true }
    })
  } catch (error: any) {
    console.error('Clear notification channel cache error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
