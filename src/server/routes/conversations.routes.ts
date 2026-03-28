/**
 * 对话管理 API 路由
 * Mounted at /api/v1/spaces
 */

import { Router } from 'express'
import { getDatabase } from '../utils/database.js'
import { legacyAuthMiddleware } from '../middleware/auth.middleware.js'
import { randomUUID } from 'crypto'

const router = Router()

// 所有对话 API 都需要认证
router.use(legacyAuthMiddleware)

/**
 * GET /api/v1/spaces/:spaceId/conversations - 获取对话列表
 */
router.get('/:spaceId/conversations', (req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT id, space_id AS spaceId, title, messages, starred, created_at AS createdAt, updated_at AS updatedAt
      FROM conversations
      WHERE space_id = ? AND user_id = ?
      ORDER BY updated_at DESC
    `).all(req.params.spaceId, req.userId) as any[]

    const conversations = rows.map(row => {
      const messages = row.messages ? JSON.parse(row.messages) : []
      const lastMessage = messages[messages.length - 1]
      return {
        id: row.id,
        spaceId: row.spaceId,
        title: row.title || 'New Conversation',
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        messageCount: messages.length,
        starred: !!row.starred,
        preview: lastMessage?.content?.substring(0, 100) || undefined,
      }
    })

    res.json({ success: true, data: conversations })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/spaces/:spaceId/conversations - 创建对话
 */
router.post('/:spaceId/conversations', (req, res) => {
  try {
    const { title } = req.body
    const db = getDatabase()
    const id = randomUUID()
    const now = Date.now()

    db.prepare(`
      INSERT INTO conversations (id, user_id, space_id, title, messages, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.userId, req.params.spaceId, title || null, '[]', now, now)

    const conversation = {
      id,
      spaceId: req.params.spaceId,
      title: title || 'New Conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      starred: false,
    }

    res.status(201).json({ success: true, data: conversation })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:spaceId/conversations/:conversationId - 获取单个对话
 */
router.get('/:spaceId/conversations/:conversationId', (req, res) => {
  try {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT id, space_id AS spaceId, title, messages, starred, created_at AS createdAt, updated_at AS updatedAt
      FROM conversations
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).get(req.params.conversationId, req.params.spaceId, req.userId) as any

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    const messages = row.messages ? JSON.parse(row.messages) : []
    const conversation = {
      id: row.id,
      spaceId: row.spaceId,
      title: row.title || 'New Conversation',
      messages,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messageCount: messages.length,
      starred: !!row.starred,
    }

    res.json({ success: true, data: conversation })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/spaces/:spaceId/conversations/:conversationId - 更新对话
 */
router.put('/:spaceId/conversations/:conversationId', (req, res) => {
  try {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT id, space_id AS spaceId, title, messages, starred, created_at AS createdAt, updated_at AS updatedAt
      FROM conversations
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).get(req.params.conversationId, req.params.spaceId, req.userId) as any

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    const { title } = req.body
    const now = Date.now()

    db.prepare(`
      UPDATE conversations SET title = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(title ?? row.title, now, req.params.conversationId, req.userId)

    const messages = row.messages ? JSON.parse(row.messages) : []
    res.json({
      success: true,
      data: {
        id: row.id,
        spaceId: row.spaceId,
        title: title ?? row.title,
        messages,
        createdAt: row.createdAt,
        updatedAt: now,
        messageCount: messages.length,
        starred: !!row.starred,
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
 * DELETE /api/v1/spaces/:spaceId/conversations/:conversationId - 删除对话
 */
router.delete('/:spaceId/conversations/:conversationId', (req, res) => {
  try {
    const db = getDatabase()
    const result = db.prepare(`
      DELETE FROM conversations
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).run(req.params.conversationId, req.params.spaceId, req.userId)

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    res.json({ success: true, data: null })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/spaces/:spaceId/conversations/:conversationId/messages - 添加消息
 */
router.post('/:spaceId/conversations/:conversationId/messages', (req, res) => {
  try {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT id, messages
      FROM conversations
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).get(req.params.conversationId, req.params.spaceId, req.userId) as any

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    const messages = row.messages ? JSON.parse(row.messages) : []
    const newMessage = {
      id: randomUUID(),
      role: req.body.role,
      content: req.body.content,
      timestamp: Date.now(),
      ...(req.body.images && { images: req.body.images }),
    }
    messages.push(newMessage)
    const now = Date.now()

    db.prepare(`
      UPDATE conversations SET messages = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(messages), now, req.params.conversationId, req.userId)

    res.json({ success: true, data: newMessage })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/spaces/:spaceId/conversations/:conversationId/messages/last - 更新最后一条消息
 */
router.put('/:spaceId/conversations/:conversationId/messages/last', (req, res) => {
  try {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT id, messages
      FROM conversations
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).get(req.params.conversationId, req.params.spaceId, req.userId) as any

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    const messages = row.messages ? JSON.parse(row.messages) : []
    if (messages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No messages to update'
      })
    }

    const lastMessage = messages[messages.length - 1]
    Object.assign(lastMessage, req.body)
    const now = Date.now()

    db.prepare(`
      UPDATE conversations SET messages = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(messages), now, req.params.conversationId, req.userId)

    res.json({ success: true, data: lastMessage })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:spaceId/conversations/:conversationId/messages/:messageId/thoughts - 获取消息思考过程
 */
router.get('/:spaceId/conversations/:conversationId/messages/:messageId/thoughts', (req, res) => {
  try {
    const db = getDatabase()
    const row = db.prepare(`
      SELECT messages
      FROM conversations
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).get(req.params.conversationId, req.params.spaceId, req.userId) as any

    if (!row) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    const messages = row.messages ? JSON.parse(row.messages) : []
    const message = messages.find((m: any) => m.id === req.params.messageId)
    const thoughts = message?.thoughts || []

    res.json({ success: true, data: thoughts })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/spaces/:spaceId/conversations/:conversationId/star - 切换收藏状态
 */
router.post('/:spaceId/conversations/:conversationId/star', (req, res) => {
  try {
    const { starred } = req.body
    const db = getDatabase()
    const now = Date.now()

    const result = db.prepare(`
      UPDATE conversations SET starred = ?, updated_at = ?
      WHERE id = ? AND space_id = ? AND user_id = ?
    `).run(starred ? 1 : 0, now, req.params.conversationId, req.params.spaceId, req.userId)

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Conversation not found'
      })
    }

    const row = db.prepare(`
      SELECT id, space_id AS spaceId, title, messages, starred, created_at AS createdAt, updated_at AS updatedAt
      FROM conversations
      WHERE id = ? AND user_id = ?
    `).get(req.params.conversationId, req.userId) as any

    const messages = row.messages ? JSON.parse(row.messages) : []
    res.json({
      success: true,
      data: {
        id: row.id,
        spaceId: row.spaceId,
        title: row.title,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        messageCount: messages.length,
        starred: !!row.starred,
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
