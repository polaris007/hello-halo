/**
 * 空间管理 API 路由
 */

import { Router } from 'express'
import { getDatabase } from '../utils/database'
import { authMiddleware } from '../middleware/auth.middleware'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'

// 数据目录
const HALO_DATA_DIR = process.env.HALO_DATA_DIR || join(homedir(), '.halo')

const router = Router()

// 所有空间 API 都需要认证
router.use(authMiddleware)

/**
 * GET /api/v1/spaces - 获取当前用户的空间列表
 */
router.get('/', (req, res) => {
  try {
    const db = getDatabase()
    const spaces = db.prepare(`
      SELECT id, name, path, created_at, updated_at
      FROM spaces
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(req.userId)

    res.json({
      success: true,
      data: spaces
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:id - 获取单个空间
 */
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase()
    const space = db.prepare(`
      SELECT id, name, path, created_at, updated_at
      FROM spaces
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.userId) as any

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    res.json({
      success: true,
      data: space
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/spaces - 创建新空间
 */
router.post('/', (req, res) => {
  try {
    const { name } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '空间名称不能为空' }
      })
    }

    const db = getDatabase()
    const id = randomUUID()
    // 按用户隔离文件系统：~/.halo/users/{user_id}/spaces/{space_id}/
    const spacePath = join(HALO_DATA_DIR, 'users', req.userId!, 'spaces', id)

    // 确保空间目录存在
    if (!existsSync(spacePath)) {
      mkdirSync(spacePath, { recursive: true })
    }

    db.prepare(`
      INSERT INTO spaces (id, user_id, name, path)
      VALUES (?, ?, ?, ?)
    `).run(id, req.userId, name, spacePath)

    res.status(201).json({
      success: true,
      data: {
        id,
        name,
        path: spacePath,
        created_at: Date.now(),
        updated_at: Date.now()
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
 * PUT /api/v1/spaces/:id - 更新空间
 */
router.put('/:id', (req, res) => {
  try {
    const { name } = req.body
    const db = getDatabase()

    // 检查空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    db.prepare(`
      UPDATE spaces
      SET name = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(name || (space as any).name, Date.now(), req.params.id, req.userId)

    res.json({
      success: true,
      data: {
        id: req.params.id,
        name: name || (space as any).name,
        updated_at: Date.now()
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
 * DELETE /api/v1/spaces/:id - 删除空间
 */
router.delete('/:id', (req, res) => {
  try {
    const db = getDatabase()

    // 检查空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, req.userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 删除空间（外键约束会自动删除相关的 conversations）
    db.prepare('DELETE FROM spaces WHERE id = ? AND user_id = ?').run(req.params.id, req.userId)

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
