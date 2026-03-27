/**
 * 应用管理 API 路由
 * 提供数字人应用的管理功能
 */

import { Router, Request, Response } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { getDatabase } from '../utils/database.js'
import { randomUUID } from 'crypto'

const router = Router()

// 所有应用 API 都需要认证
router.use(authMiddleware)

/**
 * GET /api/v1/apps - 获取应用列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { spaceId, status, type } = req.query
    const db = getDatabase()

    // 构建查询
    let query = 'SELECT * FROM apps WHERE user_id = ?'
    const params: any[] = [req.userId]

    if (spaceId) {
      query += ' AND space_id = ?'
      params.push(spaceId)
    }

    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    if (type) {
      query += ' AND type = ?'
      params.push(type)
    }

    query += ' ORDER BY created_at DESC'

    const apps = db.prepare(query).all(...params)

    res.json({
      success: true,
      data: apps
    })
  } catch (error: any) {
    console.error('List apps error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/apps/:id - 获取单个应用
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase()
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(req.params.id, req.userId) as any

    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    res.json({
      success: true,
      data: app
    })
  } catch (error: any) {
    console.error('Get app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/apps/install - 安装应用
 */
router.post('/install', async (req: Request, res: Response) => {
  try {
    const { spaceId, spec, userConfig } = req.body

    if (!spaceId || !spec) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    const db = getDatabase()

    // 验证空间
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(spaceId, req.userId)
    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 创建应用记录
    const appId = randomUUID()
    const now = Date.now()

    db.prepare(`
      INSERT INTO apps (id, user_id, space_id, name, type, status, spec, config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'paused', ?, ?, ?, ?)
    `).run(
      appId,
      req.userId,
      spaceId,
      (spec as any).name || 'Unknown App',
      (spec as any).type || 'automation',
      JSON.stringify(spec),
      JSON.stringify(userConfig || {}),
      now,
      now
    )

    res.status(201).json({
      success: true,
      data: {
        id: appId,
        name: (spec as any).name,
        status: 'paused'
      }
    })
  } catch (error: any) {
    console.error('Install app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/apps/:id - 卸载应用
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { purge } = req.query

    const db = getDatabase()

    // 检查应用是否存在
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    // 删除应用
    db.prepare('DELETE FROM apps WHERE id = ? AND user_id = ?').run(id, req.userId)

    // 如果 purge=true，同时删除相关活动记录
    if (purge) {
      db.prepare('DELETE FROM app_activities WHERE app_id = ?').run(id)
    }

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    console.error('Uninstall app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/apps/:id/pause - 暂停应用
 */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    db.prepare(`
      UPDATE apps SET status = 'paused', updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(Date.now(), id, req.userId)

    res.json({
      success: true,
      data: { id, status: 'paused' }
    })
  } catch (error: any) {
    console.error('Pause app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/apps/:id/resume - 恢复应用
 */
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    db.prepare(`
      UPDATE apps SET status = 'running', updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(Date.now(), id, req.userId)

    res.json({
      success: true,
      data: { id, status: 'running' }
    })
  } catch (error: any) {
    console.error('Resume app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/apps/:id/trigger - 手动触发应用
 */
router.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    // TODO: 实现应用触发逻辑

    res.json({
      success: true,
      data: { id, triggered: true }
    })
  } catch (error: any) {
    console.error('Trigger app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/apps/:id/state - 获取应用状态
 */
router.get('/:id/state', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId) as any
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    res.json({
      success: true,
      data: {
        id: app.id,
        status: app.status,
        lastRunAt: app.last_run_at,
        nextRunAt: app.next_run_at,
        errorCount: app.error_count || 0
      }
    })
  } catch (error: any) {
    console.error('Get app state error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/apps/:id/activity - 获取应用活动历史
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { limit = 20, offset = 0, type, since } = req.query
    const db = getDatabase()

    // 检查应用是否存在
    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    // 查询活动历史
    let query = 'SELECT * FROM app_activities WHERE app_id = ?'
    const params: any[] = [id]

    if (type) {
      query += ' AND type = ?'
      params.push(type)
    }

    if (since) {
      query += ' AND created_at > ?'
      params.push(since)
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit as string), parseInt(offset as string))

    const activities = db.prepare(query).all(...params)

    res.json({
      success: true,
      data: activities
    })
  } catch (error: any) {
    console.error('Get app activity error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/apps/:id/config - 更新应用配置
 */
router.post('/:id/config', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const config = req.body

    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    db.prepare(`
      UPDATE apps SET config = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(config), Date.now(), id, req.userId)

    res.json({
      success: true,
      data: { id, config }
    })
  } catch (error: any) {
    console.error('Update app config error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/apps/:id/frequency - 更新应用频率
 */
router.post('/:id/frequency', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { subscriptionId, frequency } = req.body

    if (!subscriptionId || !frequency) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId)
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    // TODO: 更新订阅频率

    res.json({
      success: true,
      data: { id, subscriptionId, frequency }
    })
  } catch (error: any) {
    console.error('Update app frequency error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/apps/:id/export-spec - 导出应用规范
 */
router.get('/:id/export-spec', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const app = db.prepare('SELECT * FROM apps WHERE id = ? AND user_id = ?').get(id, req.userId) as any
    if (!app) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '应用不存在' }
      })
    }

    const spec = JSON.parse(app.spec || '{}')
    const yaml = `name: ${spec.name || 'unknown'}
description: ${spec.description || ''}
type: ${spec.type || 'automation'}
version: ${spec.version || '1.0'}
`

    res.json({
      success: true,
      data: {
        yaml,
        filename: `${spec.name || 'app'}.yaml`
      }
    })
  } catch (error: any) {
    console.error('Export app spec error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
