/**
 * Authentication Service
 * JWT-based authentication with user management
 */

import { randomBytes } from 'crypto'
import { hash, compare } from '@node-rs/bcrypt'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getDatabase } from '../utils/database.js'
import { getConfig, resolveDataDir } from './config.service.js'
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  generateUUID
} from '../utils/crypto.js'

// Constants
const SALT_ROUNDS = 10
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes
const REFRESH_TOKEN_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

// In-memory store for refresh tokens (in production, use Redis or database)
const refreshTokens = new Map<string, { userId: string; expiresAt: number }>()

// ========================================
// User Management
// ========================================

/**
 * Register a new user
 */
export async function register(params: { email: string; password: string; name?: string }) {
  const { email, password, name } = params
  const db = getDatabase()

  // Check if email already exists
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existingUser) {
    throw new Error('Email already registered')
  }

  const id = generateUUID()
  const passwordHash = await hash(password, SALT_ROUNDS)
  const now = Math.floor(Date.now() / 1000)

  try {
    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, email, email, passwordHash, name || null, 'user', now, now)

    // Create user directory structure: {data-dir}/users/{user_id}/spaces/
    const dataDir = resolveDataDir()
    const userSpacesDir = join(dataDir, 'users', id, 'spaces')
    if (!existsSync(userSpacesDir)) {
      mkdirSync(userSpacesDir, { recursive: true })
    }

    // Generate tokens
    const accessToken = generateAccessToken({ userId: id, email, role: 'user' })
    const refreshToken = generateRefreshToken({ userId: id })

    // Store refresh token
    refreshTokens.set(refreshToken, {
      userId: id,
      expiresAt: Date.now() + REFRESH_TOKEN_DURATION
    })

    return {
      user: {
        id,
        email,
        name: name || null,
        role: 'user'
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 3600 // 1 hour
      }
    }
  } catch (error: any) {
    if (error.message === 'Email already registered') {
      throw error
    }
    throw new Error('Failed to create user: ' + error.message)
  }
}

/**
 * User login
 */
export async function login(email: string, password: string) {
  // Check if account is locked
  if (isAccountLocked(email)) {
    throw new Error('Account locked')
  }

  const db = getDatabase()
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any

  if (!user) {
    recordLoginAttempt(email, false)
    throw new Error('Invalid credentials')
  }

  // Verify password
  const isValid = await compare(password, user.password_hash)

  if (!isValid) {
    recordLoginAttempt(email, false)
    if (isAccountLocked(email)) {
      throw new Error('Account locked')
    }
    throw new Error('Invalid credentials')
  }

  // Record successful login
  recordLoginAttempt(email, true)

  // Update last login time
  const now = Math.floor(Date.now() / 1000)
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(now, user.id)

  // Generate tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role
  })
  const refreshToken = generateRefreshToken({ userId: user.id })

  // Store refresh token
  refreshTokens.set(refreshToken, {
    userId: user.id,
    expiresAt: Date.now() + REFRESH_TOKEN_DURATION
  })

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role
    },
    tokens: {
      accessToken,
      refreshToken,
      expiresIn: 3600 // 1 hour
    }
  }
}

/**
 * Refresh access token
 */
export async function refreshToken(token: string) {
  // Verify refresh token
  const decoded = verifyToken(token)
  if (!decoded || decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token')
  }

  // Check if token is in our store
  const stored = refreshTokens.get(token)
  if (!stored || stored.expiresAt < Date.now()) {
    refreshTokens.delete(token)
    throw new Error('Invalid refresh token')
  }

  const db = getDatabase()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.userId) as any

  if (!user) {
    refreshTokens.delete(token)
    throw new Error('User not found')
  }

  // Generate new tokens
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role
  })
  const newRefreshToken = generateRefreshToken({ userId: user.id })

  // Revoke old refresh token and store new one
  refreshTokens.delete(token)
  refreshTokens.set(newRefreshToken, {
    userId: user.id,
    expiresAt: Date.now() + REFRESH_TOKEN_DURATION
  })

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: 3600
  }
}

/**
 * User logout
 */
export async function logout(token: string) {
  // Remove refresh token from store
  const decoded = verifyToken(token)
  if (decoded) {
    // Find and remove all refresh tokens for this user
    for (const [key, value] of refreshTokens.entries()) {
      if (value.userId === decoded.userId) {
        refreshTokens.delete(key)
      }
    }
  }
}

/**
 * Change password
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const db = getDatabase()
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any

  if (!user) {
    throw new Error('User not found')
  }

  // Verify current password
  const isValid = await compare(currentPassword, user.password_hash)
  if (!isValid) {
    throw new Error('Current password is incorrect')
  }

  // Hash new password
  const newPasswordHash = await hash(newPassword, SALT_ROUNDS)
  const now = Math.floor(Date.now() / 1000)

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(newPasswordHash, now, userId)

  // Revoke all refresh tokens for this user
  for (const [key, value] of refreshTokens.entries()) {
    if (value.userId === userId) {
      refreshTokens.delete(key)
    }
  }
}

/**
 * Get user by ID
 */
export function getUserById(userId: string) {
  const db = getDatabase()
  const user = db.prepare(`
    SELECT id, email, name, role, is_default, last_login_at, created_at, updated_at
    FROM users WHERE id = ?
  `).get(userId)
  return user
}

/**
 * Get user by email
 */
export function getUserByEmail(email: string) {
  const db = getDatabase()
  return db.prepare('SELECT id, email, name, role FROM users WHERE email = ?').get(email)
}

/**
 * Check if any users exist
 */
export function hasUsers(): boolean {
  const db = getDatabase()
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as any
  return result.count > 0
}

// ========================================
// Default User Initialization
// ========================================

/**
 * Initialize default admin user (called on first startup)
 */
export async function initializeDefaultUser() {
  const config = getConfig()
  const configPassword = config.auth?.defaultPassword || process.env.HALO_DEFAULT_PASSWORD

  if (hasUsers()) {
    // If config specifies a password, update default admin's password
    if (configPassword) {
      const db = getDatabase()
      const defaultUser = db.prepare('SELECT id, email FROM users WHERE is_default = 1 LIMIT 1').get() as any
      if (defaultUser) {
        const passwordHash = await hash(configPassword, SALT_ROUNDS)
        const now = Math.floor(Date.now() / 1000)
        db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
          .run(passwordHash, now, defaultUser.id)
        console.log(`[Auth] Default user "${defaultUser.email}" password updated from config`)
      }
    }
    return null
  }

  const defaultPassword = configPassword || randomBytes(8).toString('hex')
  const id = generateUUID()
  const now = Math.floor(Date.now() / 1000)

  const db = getDatabase()
  db.prepare(`
    INSERT INTO users (id, email, username, password_hash, name, role, is_default, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, 'admin@halo.local', 'admin', await hash(defaultPassword, SALT_ROUNDS), 'Admin', 'admin', 1, now, now)

  // Create user directory: {data-dir}/users/{user_id}/spaces/
  const dataDir = resolveDataDir()
  const userSpacesDir = join(dataDir, 'users', id, 'spaces')
  if (!existsSync(userSpacesDir)) {
    mkdirSync(userSpacesDir, { recursive: true })
  }

  console.log('========================================')
  console.log('Default admin user created:')
  console.log(`  Email: admin@halo.local`)
  if (configPassword) {
    console.log(`  Password: (from config)`)
  } else {
    console.log(`  Password: ${defaultPassword}`)
  }
  console.log('========================================')

  return { email: 'admin@halo.local', password: defaultPassword }
}

// ========================================
// Account Lockout Mechanism
// ========================================

/**
 * Record login attempt
 */
export function recordLoginAttempt(email: string, success: boolean) {
  const db = getDatabase()
  const timestamp = Date.now()

  if (success) {
    // Clear failed attempts on success
    db.prepare('DELETE FROM login_attempts WHERE username = ?').run(email)
  } else {
    // Record failed attempt
    db.prepare(`
      INSERT INTO login_attempts (username, attempt_time)
      VALUES (?, ?)
    `).run(email, timestamp)
  }
}

/**
 * Check if account is locked
 */
export function isAccountLocked(email: string): boolean {
  const db = getDatabase()
  const cutoffTime = Date.now() - LOCKOUT_DURATION

  const result = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE username = ? AND attempt_time > ?
  `).get(email, cutoffTime) as any

  return result.count >= MAX_LOGIN_ATTEMPTS
}

/**
 * Clean up expired login attempts
 */
export function cleanupExpiredLoginAttempts() {
  const db = getDatabase()
  const cutoffTime = Date.now() - LOCKOUT_DURATION
  db.prepare('DELETE FROM login_attempts WHERE attempt_time < ?').run(cutoffTime)
}

/**
 * Clean up expired refresh tokens
 */
export function cleanupExpiredRefreshTokens() {
  const now = Date.now()
  for (const [key, value] of refreshTokens.entries()) {
    if (value.expiresAt < now) {
      refreshTokens.delete(key)
    }
  }
}

/**
 * Clean up all expired sessions and tokens
 * Called on server startup
 */
export function cleanupExpiredSessions() {
  cleanupExpiredLoginAttempts()
  cleanupExpiredRefreshTokens()
  console.log('[Auth] Cleaned up expired sessions and tokens')
}
