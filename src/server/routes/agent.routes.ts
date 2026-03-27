/**
 * Agent API 路由
 * 提供 Agent 会话管理和消息发送功能
 *
 * SSE 流式响应架构：
 * - POST /message 返回 SSE 流（主通道）
 * - WebSocket 用于全局事件和兼容性（双通道架构）
 */

import { Router, Response } from 'express'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { getDatabase } from '../utils/database.js'
import { randomUUID } from 'crypto'
import * as agentService from '../services/agent/index.js'
import { createSseWriter, setSSEHeaders, SseWriter } from '../utils/sse-writer.js'
import {
  registerSSEStream,
  unregisterSSEStream,
  getSSEStream
} from '../services/agent/session-manager.js'

const router = Router()

// 所有 Agent API 都需要认证
router.use(authMiddleware)

/**
 * POST /api/v1/agent/message - 发送消息到 Agent
 *
 * 返回 SSE 流式响应，实时推送 Agent 处理事件
 * 同时通过 WebSocket 推送（双通道架构）
 */
router.post('/message', async (req, res) => {
  const { spaceId, conversationId, message, clientMessageId, images, aiBrowserEnabled, thinkingEnabled, canvasContext } = req.body

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

  // 添加用户消息 - 使用客户端传递的消息 ID（如果提供）
  const messages = JSON.parse(conversation.messages || '[]')
  const userMessage = {
    id: clientMessageId || randomUUID(),  // 使用客户端 ID 或生成新 ID
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

  // 设置 SSE 响应头
  setSSEHeaders(res)

  // 创建 SSE writer
  const sseWriter = createSseWriter(res)

  // 创建 AbortController 用于取消请求
  const abortController = new AbortController()

  // 注册 SSE 流
  registerSSEStream(conversationId, sseWriter, abortController)

  // 处理连接断开
  req.on('close', () => {
    console.log(`[SSE][${conversationId}] Client disconnected`)
    abortController.abort()
    unregisterSSEStream(conversationId)
  })

  try {
    // 启动 AI 处理并传递 SSE writer
    await agentService.sendMessageWithSSE({
      spaceId,
      conversationId,
      message,
      images,
      aiBrowserEnabled,
      thinkingEnabled,
      canvasContext,
      sseWriter,
      abortController
    })
  } catch (error: any) {
    console.error('[Agent] SSE processing error:', error)
    console.error('[Agent] SSE processing stack:', error.stack)
    // 发送错误事件
    if (!sseWriter.isClosed()) {
      sseWriter.writeEvent('error', {
        type: 'agent:error',
        error: error.message || '处理失败',
        errorType: 'unknown'
      })
    }
  } finally {
    // 清理 SSE 流
    unregisterSSEStream(conversationId)
    sseWriter.end()
  }
})

/**
 * POST /api/v1/agent/stop - 停止 Agent 生成
 */
router.post('/stop', async (req, res) => {
  try {
    const { conversationId } = req.body

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少 conversationId' }
      })
    }

    // 停止生成
    await agentService.stopGeneration(conversationId)

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

    // 检查是否有活跃会话
    const sessionState = agentService.getSessionState(conversationId)

    res.json({
      success: true,
      data: {
        conversationId,
        isActive: sessionState?.isGenerating || false,
        thoughts: sessionState?.thoughts || [],
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
    const { conversationId, toolId } = req.body

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少 conversationId' }
      })
    }

    // 批准工具调用
    await agentService.approveTool(conversationId, toolId)

    res.json({
      success: true,
      data: {
        approved: true,
        conversationId,
        toolId
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
    const { conversationId, toolId } = req.body

    if (!conversationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少 conversationId' }
      })
    }

    // 拒绝工具调用
    await agentService.rejectTool(conversationId, toolId)

    res.json({
      success: true,
      data: {
        rejected: true,
        conversationId,
        toolId
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

    if (!spaceId || !conversationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    // 预热会话（初始化 V2 Session）
    await agentService.warmSession(spaceId, conversationId)

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

    if (!conversationId || !id) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    // 提交问题答案
    await agentService.answerQuestion(conversationId, id, answers)

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
    // 获取 MCP 服务器状态
    const servers = await agentService.getMcpServerStatus()

    res.json({
      success: true,
      servers
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
