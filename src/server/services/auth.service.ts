/**
 * 用户认证服务
 * 处理用户登录、登出、会话管理等功能
 */

import { randomBytes, createHash } from 'crypto'
import { hash, compare } from '@node-rs/bcrypt'
import { getDatabase } from '../utils/database'

const SALT_ROUNDS = 10
const TOKEN_LENGTH = 32
const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 天
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 分钟

// ========================================
// 用户管理
// ========================================

/**
 * 创建用户
 */
export async function createUser(username: string, password: string, isDefault = false) {
  const db = getDatabase()
  const id = randomBytes(16).toString('hex')
  const passwordHash = await hash(password, SALT_ROUNDS)

  try {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, is_default)
      VALUES (?, ?, ?, ?)
    `).run(id, username, passwordHash, isDefault ? 1 : 0)

    return { id, username, is_default: isDefault ? 1 : 0 }
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      throw new Error('用户名已存在')
    }
    throw error
  }
}

/**
 * 验证用户密码
 */
export async function verifyPassword(username: string, password: string): Promise<boolean> {
  const db = getDatabase()
  const user = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username) as any

  if (!user) {
    return false
  }

  return compare(password, user.password_hash)
}

/**
 * 获取用户信息
 */
export function getUserByUsername(username: string) {
  const db = getDatabase()
  return db.prepare('SELECT id, username, is_default, created_at FROM users WHERE username = ?').get(username)
}

/**
 * 获取用户信息（通过 ID）
 */
export function getUserById(userId: string) {
  const db = getDatabase()
  return db.prepare('SELECT id, username, is_default, created_at FROM users WHERE id = ?').get(userId)
}

/**
 * 检查是否存在用户
 */
export function hasUsers(): boolean {
  const db = getDatabase()
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as any
  return result.count > 0
}

// ========================================
// 会话管理
// ========================================

/**
 * 创建会话
 */
export function createSession(userId: string) {
  const db = getDatabase()
  const id = randomBytes(16).toString('hex')
  const token = randomBytes(TOKEN_LENGTH).toString('hex')
  const expiresAt = Date.now() + SESSION_DURATION

  db.prepare(`
    INSERT INTO sessions (id, user_id, token, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, userId, token, expiresAt)

  return { id, token, expires_at: expiresAt }
}

/**
 * 验证会话 Token
 */
export function validateSession(token: string) {
  const db = getDatabase()
  const session = db.prepare(`
    SELECT s.*, u.username
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, Date.now()) as any

  return session || null
}

/**
 * 销毁会话
 */
export function destroySession(token: string) {
  const db = getDatabase()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

/**
 * 清理过期会话
 */
export function cleanupExpiredSessions() {
  const db = getDatabase()
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())
}

// ========================================
// 登录/登出
// ========================================

/**
 * 用户登录
 */
export async function login(username: string, password: string) {
  // 检查账户是否被锁定
  if (isAccountLocked(username)) {
    const remainingTime = getLockoutRemainingTime(username)
    const remainingMinutes = Math.ceil(remainingTime / 60000)
    throw new Error(`账户已锁定，请 ${remainingMinutes} 分钟后再试`)
  }

  // 验证密码
  const isValid = await verifyPassword(username, password)

  if (!isValid) {
    // 记录失败尝试
    recordLoginAttempt(username, false)

    // 检查是否达到锁定阈值
    if (isAccountLocked(username)) {
      throw new Error('账户已锁定，请 15 分钟后再试')
    }

    throw new Error('用户名或密码错误')
  }

  // 记录成功登录
  recordLoginAttempt(username, true)

  // 获取用户信息
  const user = getUserByUsername(username)
  if (!user) {
    throw new Error('用户不存在')
  }

  // 创建会话
  const session = createSession((user as any).id)

  return {
    user: {
      id: (user as any).id,
      username: (user as any).username
    },
    session: {
      token: session.token,
      expires_at: session.expires_at
    }
  }
}

/**
 * 用户登出
 */
export function logout(token: string) {
  destroySession(token)
}

// ========================================
// 默认用户初始化
// ========================================

/**
 * 初始化默认用户（首次启动时调用）
 */
export async function initializeDefaultUser() {
  if (hasUsers()) {
    return null
  }

  const defaultPassword = process.env.HALO_DEFAULT_PASSWORD || randomBytes(8).toString('hex')
  const user = await createUser('admin', defaultPassword, true)

  console.log('========================================')
  console.log('Default user created:')
  console.log(`  Username: admin`)
  console.log(`  Password: ${defaultPassword}`)
  console.log('========================================')

  return { username: 'admin', password: defaultPassword }
}

// ========================================
// 账户锁定机制
// ========================================

/**
 * 记录登录失败尝试
 */
export function recordLoginAttempt(username: string, success: boolean) {
  const db = getDatabase()
  const timestamp = Date.now()

  if (success) {
    // 成功登录，清除失败记录
    db.prepare('DELETE FROM login_attempts WHERE username = ?').run(username)
  } else {
    // 记录失败尝试
    db.prepare(`
      INSERT INTO login_attempts (username, attempt_time)
      VALUES (?, ?)
    `).run(username, timestamp)
  }
}

/**
 * 检查账户是否被锁定
 */
export function isAccountLocked(username: string): boolean {
  const db = getDatabase()
  const cutoffTime = Date.now() - LOCKOUT_DURATION

  // 获取最近的失败尝试次数
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE username = ? AND attempt_time > ?
  `).get(username, cutoffTime) as any

  return result.count >= MAX_LOGIN_ATTEMPTS
}

/**
 * 获取账户锁定剩余时间（毫秒）
 */
export function getLockoutRemainingTime(username: string): number {
  const db = getDatabase()
  const cutoffTime = Date.now() - LOCKOUT_DURATION

  // 获取最早的失败尝试时间
  const result = db.prepare(`
    SELECT MIN(attempt_time) as first_attempt FROM login_attempts
    WHERE username = ? AND attempt_time > ?
  `).get(username, cutoffTime) as any

  if (!result.first_attempt) {
    return 0
  }

  const lockoutExpires = result.first_attempt + LOCKOUT_DURATION
  return Math.max(0, lockoutExpires - Date.now())
}

/**
 * 清理过期的登录尝试记录
 */
export function cleanupExpiredLoginAttempts() {
  const db = getDatabase()
  const cutoffTime = Date.now() - LOCKOUT_DURATION
  db.prepare('DELETE FROM login_attempts WHERE attempt_time < ?').run(cutoffTime)
}
