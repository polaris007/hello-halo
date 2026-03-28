/**
 * Authentication Middleware
 * Validates JWT tokens and extracts user information
 */

import { Request, Response, NextFunction } from 'express'
import { verifyToken } from '../utils/crypto.js'
import { getDatabase } from '../utils/database.js'

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      userId?: string
      userEmail?: string
      userRole?: string
      authMode?: string
      file?: Express.Multer.File
    }
  }
}

/**
 * JWT Authentication Middleware
 * Validates the Authorization header and attaches user info to request
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authorization header missing' }
    })
    return
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid authorization format. Use: Bearer <token>' }
    })
    return
  }

  const token = parts[1]
  const decoded = verifyToken(token)

  if (!decoded) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    })
    return
  }

  if (decoded.type !== 'access') {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid token type' }
    })
    return
  }

  // Attach user info to request
  req.userId = decoded.userId
  req.userEmail = decoded.email
  req.userRole = decoded.role
  req.authMode = 'jwt'

  next()
}

/**
 * Admin Role Middleware
 * Ensures the user has admin role
 * Must be used after authMiddleware
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== 'admin') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' }
    })
    return
  }

  next()
}

/**
 * Optional Authentication Middleware
 * Validates token if present, but doesn't require it
 * Attaches user info if valid token is provided
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    next()
    return
  }

  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    next()
    return
  }

  const token = parts[1]
  const decoded = verifyToken(token)

  if (decoded && decoded.type === 'access') {
    req.userId = decoded.userId
    req.userEmail = decoded.email
    req.userRole = decoded.role
    req.authMode = 'jwt'
  }

  next()
}

/**
 * Legacy auth middleware for backward compatibility
 * Supports multiple auth modes: normal (JWT), disabled, hybrid, header
 */
export interface AuthConfig {
  mode: 'normal' | 'disabled' | 'hybrid' | 'header'
  simpleToken?: string | string[]
  headerName?: string
}

let authConfig: AuthConfig = {
  mode: (process.env.HALO_AUTH_MODE === 'simple' ? 'hybrid' : process.env.HALO_AUTH_MODE) as AuthConfig['mode'] || 'normal',
  simpleToken: process.env.HALO_AUTH_SIMPLE_TOKEN,
  headerName: process.env.HALO_AUTH_HEADER_NAME || 'X-User-Id',
}

export function loadAuthConfig(config: AuthConfig) {
  authConfig = { ...authConfig, ...config }
}

export function getAuthConfig(): AuthConfig {
  return authConfig
}

/**
 * Legacy auth middleware with fallback support
 */
export async function legacyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const mode = authConfig.mode

  // disabled mode: skip auth, use default user
  if (mode === 'disabled') {
    const defaultUser = await getDefaultUser()
    if (defaultUser) {
      req.userId = defaultUser.id
      req.userEmail = defaultUser.email
      req.userRole = defaultUser.role
      req.authMode = 'disabled'
    }
    next()
    return
  }

  // hybrid mode: validate fixed token or JWT token
  if (mode === 'hybrid') {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace('Bearer ', '')

    // First check if it's a simple token
    const validTokens = Array.isArray(authConfig.simpleToken) 
      ? authConfig.simpleToken 
      : (authConfig.simpleToken ? [authConfig.simpleToken] : [])

    if (validTokens.includes(token)) {
      const defaultUser = await getDefaultUser()
      if (defaultUser) {
        req.userId = defaultUser.id
        req.userEmail = defaultUser.email
        req.userRole = defaultUser.role
        req.authMode = 'hybrid'
      }
      next()
      return
    }

    // If not a simple token, try to validate as JWT token
    const decoded = verifyToken(token)
    if (decoded && decoded.type === 'access') {
      req.userId = decoded.userId
      req.userEmail = decoded.email
      req.userRole = decoded.role
      req.authMode = 'jwt'
      next()
      return
    }

    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    })
    return
  }

  // header mode: read user id from header
  if (mode === 'header') {
    const headerName = authConfig.headerName || 'X-User-Id'
    const userId = req.headers[headerName.toLowerCase()] as string

    if (userId) {
      const user = await getUserById(userId)
      if (user) {
        req.userId = userId
        req.userEmail = user.email
        req.userRole = user.role
        req.authMode = 'header'
        next()
        return
      }
    }

    res.status(401).json({
      success: false,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' }
    })
    return
  }

  // normal mode: use JWT auth
  authMiddleware(req, res, next)
}

// Database helper functions
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
