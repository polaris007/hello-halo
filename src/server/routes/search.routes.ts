/**
 * 搜索 API 路由
 * 提供全局搜索功能
 */

import { Router, Request, Response } from 'express'
import { legacyAuthMiddleware } from '../middleware/auth.middleware.js'
import { getDatabase } from '../utils/database.js'

const router = Router()

// 所有搜索 API 都需要认证
router.use(legacyAuthMiddleware)

/**
 * POST /api/v1/search - 执行搜索
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { query, scope, conversationId, spaceId } = req.body

    if (!query || !scope) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    const db = getDatabase()
    const results: any[] = []

    // 根据搜索范围执行搜索
    if (scope === 'conversation' && conversationId) {
      // 搜索特定对话
      const conversation = db.prepare(`
        SELECT * FROM conversations WHERE id = ? AND user_id = ?
      `).get(conversationId, req.userId) as any

      if (conversation) {
        const messages = JSON.parse(conversation.messages || '[]')
        const matchedMessages = messages.filter((msg: any) =>
          msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
        )

        results.push({
          type: 'conversation',
          id: conversationId,
          title: conversation.title,
          matches: matchedMessages
        })
      }
    } else if (scope === 'space' && spaceId) {
      // 搜索特定空间
      const space = db.prepare(`
        SELECT * FROM spaces WHERE id = ? AND user_id = ?
      `).get(spaceId, req.userId)

      if (space) {
        // 搜索空间内的对话
        const conversations = db.prepare(`
          SELECT * FROM conversations WHERE space_id = ? AND user_id = ?
        `).all(spaceId, req.userId) as any[]

        for (const conv of conversations) {
          const messages = JSON.parse(conv.messages || '[]')
          const matchedMessages = messages.filter((msg: any) =>
            msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
          )

          if (matchedMessages.length > 0) {
            results.push({
              type: 'conversation',
              id: conv.id,
              title: conv.title,
              spaceId: spaceId,
              matches: matchedMessages
            })
          }
        }
      }
    } else if (scope === 'global') {
      // 全局搜索
      const conversations = db.prepare(`
        SELECT * FROM conversations WHERE user_id = ?
      `).all(req.userId) as any[]

      for (const conv of conversations) {
        const messages = JSON.parse(conv.messages || '[]')
        const matchedMessages = messages.filter((msg: any) =>
          msg.content && msg.content.toLowerCase().includes(query.toLowerCase())
        )

        if (matchedMessages.length > 0) {
          results.push({
            type: 'conversation',
            id: conv.id,
            title: conv.title,
            spaceId: conv.space_id,
            matches: matchedMessages
          })
        }
      }
    }

    res.json({
      success: true,
      data: {
        query,
        scope,
        results,
        total: results.length
      }
    })
  } catch (error: any) {
    console.error('Search error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/search/cancel - 取消搜索
 */
router.post('/cancel', async (req: Request, res: Response) => {
  try {
    // TODO: 实现搜索取消逻辑

    res.json({
      success: true,
      data: { cancelled: true }
    })
  } catch (error: any) {
    console.error('Cancel search error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
