/**
 * Admin API Routes
 * User management and system configuration for administrators
 */

import { Router } from 'express'
import { getDatabase, logActivity } from '../utils/database.js'
import { legacyAuthMiddleware, adminMiddleware } from '../middleware/auth.middleware.js'
import { hash } from '@node-rs/bcrypt'
import { randomUUID } from 'crypto'
import { getConfig, saveConfig } from '../services/config.service.js'

const router = Router()

// All admin APIs require authentication and admin role
router.use(legacyAuthMiddleware)
router.use(adminMiddleware)

const SALT_ROUNDS = 10

/**
 * GET /api/v1/admin/users - List all users
 */
router.get('/users', (req, res) => {
  try {
    const db = getDatabase()
    const { page = 1, limit = 20 } = req.query

    const offset = (Number(page) - 1) * Number(limit)

    const users = db.prepare(`
      SELECT id, email, name, role, is_default, last_login_at, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(Number(limit), offset)

    const total = (db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
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
 * POST /api/v1/admin/users - Create new user
 */
router.post('/users', async (req, res) => {
  try {
    const { email, password, name, role = 'user' } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Email and password are required' }
      })
    }

    const db = getDatabase()

    // Check if email exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: 'Email already registered' }
      })
    }

    const id = randomUUID()
    const passwordHash = await hash(password, SALT_ROUNDS)
    const now = Math.floor(Date.now() / 1000)

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, email, passwordHash, name || null, role, now, now)

    const user = db.prepare(`
      SELECT id, email, name, role, created_at, updated_at
      FROM users WHERE id = ?
    `).get(id)

    // Log activity
    logActivity(req.userId!, 'admin.user_create', { targetUserId: id, email, role }, req.ip, req.headers['user-agent'])

    res.status(201).json({
      success: true,
      data: user
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/admin/users/:id - Update user
 */
router.put('/users/:id', async (req, res) => {
  try {
    const { name, role } = req.body
    const db = getDatabase()

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      })
    }

    const now = Math.floor(Date.now() / 1000)

    db.prepare(`
      UPDATE users
      SET name = ?, role = ?, updated_at = ?
      WHERE id = ?
    `).run(name ?? user.name, role ?? user.role, now, req.params.id)

    const updated = db.prepare(`
      SELECT id, email, name, role, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id)

    // Log activity
    logActivity(req.userId!, 'admin.user_update', { targetUserId: req.params.id, name, role }, req.ip, req.headers['user-agent'])

    res.json({
      success: true,
      data: updated
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/admin/users/:id - Delete user (soft delete)
 */
router.delete('/users/:id', (req, res) => {
  try {
    const db = getDatabase()

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as any
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' }
      })
    }

    // Prevent deleting the last admin
    if (user.role === 'admin') {
      const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as any).count
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'CANNOT_DELETE', message: 'Cannot delete the last admin user' }
        })
      }
    }

    // Soft delete by marking as inactive (or actually delete for now)
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id)

    // Log activity
    logActivity(req.userId!, 'admin.user_delete', { targetUserId: req.params.id, email: user.email }, req.ip, req.headers['user-agent'])

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
 * GET /api/v1/admin/config - Get system configuration
 */
router.get('/config', (req, res) => {
  try {
    const config = getConfig()

    res.json({
      success: true,
      data: {
        aiProvider: config.aiProvider,
        features: config.features,
        limits: config.limits
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
 * PUT /api/v1/admin/config - Update system configuration
 */
router.put('/config', (req, res) => {
  try {
    const updates = req.body

    saveConfig(updates)

    // Log activity
    logActivity(req.userId!, 'admin.config_update', { updates }, req.ip, req.headers['user-agent'])

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
 * GET /api/v1/admin/activity - Get activity logs
 */
router.get('/activity', (req, res) => {
  try {
    const { userId, startDate, endDate, page = 1, limit = 50 } = req.query
    const db = getDatabase()

    let query = `
      SELECT id, user_id, action, details, created_at
      FROM activity_logs
      WHERE 1=1
    `
    const params: any[] = []

    if (userId) {
      query += ' AND user_id = ?'
      params.push(userId)
    }

    if (startDate) {
      query += ' AND created_at >= ?'
      params.push(startDate)
    }

    if (endDate) {
      query += ' AND created_at <= ?'
      params.push(endDate)
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(Number(limit), (Number(page) - 1) * Number(limit))

    const logs = db.prepare(query).all(...params)

    res.json({
      success: true,
      data: logs
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
