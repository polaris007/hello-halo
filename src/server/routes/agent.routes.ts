/**
 * Agent API 路由
 * 提供 Agent 会话管理和消息发送功能
 */

import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import { getDatabase } from '../utils/database'
import { randomUUID } from 'crypto'

const router = Router()

// 所有 Agent API 都需要认证
router.use(authMiddleware)

/**
 * POST /api/v1/agent/message - 发送消息到 Agent
 *
 * 注意：完整的 Agent 功能需要迁移 src/main/services/agent/ 中的核心逻辑
 * 目前返回占位响应
 */
router.post('/message', async (req, res) => {
  try {
    const { spaceId, conversationId, message, images, aiBrowserEnabled, thinkingEnabled, canvasContext } = req.body

    if (!spaceId || !conversationId || !message) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    const db = getDatabase()

    // 验证空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(spaceId, req.userId)
    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 检查对话是否存在
    let conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND user_id = ?
    `).get(conversationId, req.userId) as any

    if (!conversation) {
      // 创建新对话
      const now = Date.now()
      db.prepare(`
        INSERT INTO conversations (id, user_id, space_id, title, messages, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(conversationId, req.userId, spaceId, '新对话', '[]', now, now)

      conversation = {
        id: conversationId,
        user_id: req.userId,
        space_id: spaceId,
        title: '新对话',
        messages: '[]'
      }
    }

    // 添加用户消息
    const messages = JSON.parse(conversation.messages || '[]')
    const userMessage = {
      id: randomUUID(),
      role: 'user',
      content: message,
      images: images || [],
      timestamp: Date.now()
    }
    messages.push(userMessage)

    db.prepare(`
      UPDATE conversations
      SET messages = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(messages), Date.now(), conversationId, req.userId)

    // 注意：完整的 Agent 功能需要 Electron 主进程支持
    // 在纯 Web 服务器模式下，我们返回一个提示信息
    // 要使用完整的对话功能，请通过 Electron 应用运行（npm run dev 或 npm start）

    res.json({
      success: true,
      data: {
        messageId: userMessage.id,
        conversationId,
        status: 'saved',
        message: '消息已保存到数据库。注意：完整的 AI 对话功能需要 Electron 主进程支持。请通过 Electron 应用运行以获得完整功能。'
      }
    })
  } catch (error: any) {
    console.error('Agent message error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/agent/stop - 停止 Agent 生成
 */
router.post('/stop', async (req, res) => {
  try {
    const { conversationId } = req.body

    // TODO: 实现停止生成逻辑
    // 需要迁移 src/main/services/agent/control.ts 中的 stopGeneration 函数

    res.json({
      success: true,
      data: {
        stopped: true,
        conversationId
      }
    })
  } catch (error: any) {
    console.error('Stop generation error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/agent/session/:conversationId - 获取会话状态
 */
router.get('/session/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params

    const db = getDatabase()
    const conversation = db.prepare(`
      SELECT * FROM conversations WHERE id = ? AND user_id = ?
    `).get(conversationId, req.userId) as any

    if (!conversation) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '对话不存在' }
      })
    }

    const messages = JSON.parse(conversation.messages || '[]')
    const lastMessage = messages[messages.length - 1]

    res.json({
      success: true,
      data: {
        conversationId,
        isActive: false, // TODO: 检查是否有活跃会话
        thoughts: [],
        lastMessage: lastMessage || null,
        messageCount: messages.length
      }
    })
  } catch (error: any) {
    console.error('Get session state error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/agent/approve - 批准工具调用
 */
router.post('/approve', async (req, res) => {
  try {
    const { conversationId } = req.body

    // TODO: 实现工具调用批准逻辑
    // 需要迁移 src/main/services/agent/permission-handler.ts 中的相关逻辑

    res.json({
      success: true,
      data: {
        approved: true,
        conversationId
      }
    })
  } catch (error: any) {
    console.error('Approve tool error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/agent/reject - 拒绝工具调用
 */
router.post('/reject', async (req, res) => {
  try {
    const { conversationId } = req.body

    // TODO: 实现工具调用拒绝逻辑

    res.json({
      success: true,
      data: {
        rejected: true,
        conversationId
      }
    })
  } catch (error: any) {
    console.error('Reject tool error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/agent/warm - 预热会话
 */
router.post('/warm', async (req, res) => {
  try {
    const { spaceId, conversationId } = req.body

    // TODO: 实现会话预热逻辑
    // 预热可以提前初始化必要的资源

    res.json({
      success: true,
      data: {
        warmed: true,
        spaceId,
        conversationId
      }
    })
  } catch (error: any) {
    console.error('Warm session error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/agent/answer-question - 回答问题
 */
router.post('/answer-question', async (req, res) => {
  try {
    const { conversationId, id, answers } = req.body

    // TODO: 实现问题回答逻辑
    // 用于处理 Agent 向用户提问的场景

    res.json({
      success: true,
      data: {
        submitted: true,
        conversationId,
        questionId: id
      }
    })
  } catch (error: any) {
    console.error('Answer question error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/agent/test-mcp - 测试 MCP 连接
 */
router.post('/test-mcp', async (req, res) => {
  try {
    // TODO: 实现 MCP 连接测试逻辑
    // 需要迁移 src/main/services/agent/mcp-manager.ts 中的相关逻辑

    res.json({
      success: true,
      servers: []
    })
  } catch (error: any) {
    console.error('Test MCP error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
