/**
 * 用户认证中间件
 * 支持多种认证模式：normal, disabled, simple, header
 */

import { Request, Response, NextFunction } from 'express'
import { getDatabase } from '../utils/database'

// 认证模式配置
export interface AuthConfig {
  mode: 'normal' | 'disabled' | 'simple' | 'header'
  simpleToken?: string
  headerName?: string
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: string
      authMode?: string
      file?: Express.Multer.File
    }
  }
}

let authConfig: AuthConfig = {
  mode: process.env.HALO_AUTH_MODE as AuthConfig['mode'] || 'normal',
  simpleToken: process.env.HALO_AUTH_SIMPLE_TOKEN,
  headerName: process.env.HALO_AUTH_HEADER_NAME || 'X-User-Id',
}

// 从配置文件加载认证配置
export function loadAuthConfig(config: AuthConfig) {
  authConfig = { ...authConfig, ...config }
}

export function getAuthConfig(): AuthConfig {
  return authConfig
}

/**
 * 认证中间件
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const mode = authConfig.mode

  // disabled 模式：跳过认证，使用默认用户
  if (mode === 'disabled') {
    const defaultUser = await getDefaultUser()
    if (defaultUser) {
      req.userId = defaultUser.id
      req.authMode = 'disabled'
    }
    next()
    return
  }

  // simple 模式：验证固定 Token
  if (mode === 'simple') {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace('Bearer ', '')

    if (token === authConfig.simpleToken) {
      const defaultUser = await getDefaultUser()
      if (defaultUser) {
        req.userId = defaultUser.id
        req.authMode = 'simple'
      }
      next()
      return
    }

    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: '无效的 Token' }
    })
    return
  }

  // header 模式：从请求头读取用户标识
  if (mode === 'header') {
    const headerName = authConfig.headerName || 'X-User-Id'
    const userId = req.headers[headerName.toLowerCase()] as string

    if (userId) {
      // 验证用户是否存在
      const user = await getUserById(userId)
      if (user) {
        req.userId = userId
        req.authMode = 'header'
        next()
        return
      }
    }

    res.status(401).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: '用户不存在' }
    })
    return
  }

  // normal 模式：标准 Bearer Token 认证
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token) {
    res.status(401).json({
      success: false,
      error: { code: 'MISSING_TOKEN', message: '缺少认证 Token' }
    })
    return
  }

  try {
    const user = await getUserByToken(token)
    if (user) {
      req.userId = user.id
      req.authMode = 'normal'
      next()
      return
    }

    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: '无效的 Token' }
    })
  } catch (error) {
    console.error('Auth middleware error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'AUTH_ERROR', message: '认证失败' }
    })
  }
}

/**
 * 可选认证中间件 - 不强制要求认证
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')

  if (token) {
    try {
      const user = await getUserByToken(token)
      if (user) {
        req.userId = user.id
        req.authMode = 'normal'
      }
    } catch (error) {
      // 忽略错误，继续请求
    }
  }

  next()
}

// ========================================
// 数据库辅助函数
// ========================================

async function getDefaultUser() {
  try {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE is_default = 1 LIMIT 1').get() as any
    return user || null
  } catch (error) {
    console.error('Error getting default user:', error)
    return null
  }
}

async function getUserById(userId: string) {
  try {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any
    return user || null
  } catch (error) {
    console.error('Error getting user by id:', error)
    return null
  }
}

async function getUserByToken(token: string) {
  try {
    const db = getDatabase()
    const session = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(token, Date.now()) as any
    if (!session) {
      return null
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as any
    return user || null
  } catch (error) {
    console.error('Error getting user by token:', error)
    return null
  }
}
