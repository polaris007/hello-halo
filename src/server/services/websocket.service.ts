/**
 * WebSocket 服务
 * 处理 WebSocket 连接、认证和事件推送
 */

import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { IncomingMessage } from 'http'
import { URL } from 'url'
import { getDatabase } from '../utils/database'
import { getAuthConfig } from '../middleware/auth.middleware'
import { verifyToken } from '../utils/crypto'

// 客户端连接类型
interface ClientConnection {
  ws: WebSocket
  userId: string
  authMode: string
}

// 存储所有连接
const clients: Map<string, Set<ClientConnection>> = new Map()

/**
 * 初始化 WebSocket 服务器
 */
export function initializeWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
  })

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const token = url.searchParams.get('token') || (req.headers['sec-websocket-protocol'] as string | undefined) || null

    try {
      // 验证用户
      const user = await authenticateUser(token)

      if (!user) {
        ws.close(4001, '认证失败')
        return
      }

      // 存储连接
      const userId = user.id
      if (!clients.has(userId)) {
        clients.set(userId, new Set())
      }
      const clientConnection: ClientConnection = { ws, userId, authMode: user.authMode }
      clients.get(userId)!.add(clientConnection)

      // 发送欢迎消息
      ws.send(JSON.stringify({
        type: 'connected',
        data: { userId }
      }))

      // 处理消息
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString())
          handleMessage(ws, userId, data)
        } catch (error) {
          console.error('WebSocket message error:', error)
        }
      })

      // 处理断开连接
      ws.on('close', () => {
        const userClients = clients.get(userId)
        if (userClients) {
          userClients.delete(clientConnection)
          if (userClients.size === 0) {
            clients.delete(userId)
          }
        }
      })

    } catch (error) {
      console.error('WebSocket connection error:', error)
      ws.close(4000, '连接错误')
    }
  })

  return wss
}

/**
 * 验证用户 Token
 */
async function authenticateUser(token: string | null) {
  const authConfig = getAuthConfig()

  // disabled 模式：无需 token
  if (authConfig.mode === 'disabled') {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE is_default = 1 LIMIT 1').get() as any
    return user ? { id: user.id, authMode: 'disabled' } : null
  }

  if (!token) {
    return null
  }

  // simple 模式
  if (authConfig.mode === 'simple') {
    if (token === authConfig.simpleToken) {
      const db = getDatabase()
      const user = db.prepare('SELECT * FROM users WHERE is_default = 1 LIMIT 1').get() as any
      return user ? { id: user.id, authMode: 'simple' } : null
    }
    return null
  }

  // normal 模式：验证 JWT Token
  try {
    const decoded = verifyToken(token)
    if (decoded && decoded.type === 'access') {
      return { id: decoded.userId, authMode: 'normal' }
    }
  } catch (error) {
    console.error('JWT validation error:', error)
  }

  return null
}

/**
 * 处理客户端消息
 */
function handleMessage(ws: WebSocket, userId: string, data: any) {
  const { type, payload } = data

  switch (type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))
      break


    default:
      console.log('Unknown message type:', type)
  }
}

/**
 * 订阅用户到特定对话
 */

/**
 * 向特定用户推送事件
 */
export function sendToUser(userId: string, event: any) {
  const userClients = clients.get(userId)
  if (!userClients) {
    return
  }

  const message = JSON.stringify(event)
  userClients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
    }
  })
}

/**
 * 向所有用户广播事件
 */
export function broadcastToAll(event: any) {
  const message = JSON.stringify(event)
  clients.forEach((userClients) => {
    userClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message)
      }
    })
  })
}

/**
 * 向特定用户推送 Agent 事件
 */
export function sendAgentEvent(userId: string, eventType: string, data: any) {
  sendToUser(userId, {
    type: 'agent:event',
    payload: {
      eventType,
      data
    }
  })
}

/**
 * 向订阅了特定对话的所有用户推送 Agent 事件
 */
export function broadcastAgentEvent(eventType: string, data: any): void {
  const conversationId = data.conversationId
  if (!conversationId) {
    console.warn('[WebSocket] broadcastAgentEvent: no conversationId in data')
    return
  }

  const event = {
    type: 'agent:event',
    payload: {
      eventType,
      data
    }
  }

  const message = JSON.stringify(event)

  // 广播给所有连接的客户端（双通道架构）
  clients.forEach((userClients) => {
    userClients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message)
      }
    })
  })
}

/**
 * 向特定用户推送文件变更事件
 */
export function sendFileChangeEvent(userId: string, action: string, path: string) {
  sendToUser(userId, {
    type: 'file:change',
    payload: {
      action,
      path
    }
  })
}

/**
 * 清理断开的连接
 */
export function cleanupDisconnectedClients() {
  clients.forEach((userClients, userId) => {
    userClients.forEach((client) => {
      if (client.ws.readyState !== WebSocket.OPEN) {
        userClients.delete(client)
      }
    })
    if (userClients.size === 0) {
      clients.delete(userId)
    }
  })
}
