/**
 * Crypto utilities for authentication
 * Provides password hashing and JWT token management
 */

import { randomBytes, createHash } from 'crypto'
import jwt from 'jsonwebtoken'

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'halo-default-secret-change-in-production'
const JWT_ACCESS_EXPIRES_IN = '365d' // 1年有效期
const JWT_REFRESH_EXPIRES_IN = '3650d'

// Password hashing configuration
const SALT_LENGTH = 16
const ITERATIONS = 100000
const KEY_LENGTH = 64
const DIGEST = 'sha512'

/**
 * Hash a password using PBKDF2
 * @param password - Plain text password
 * @returns Hashed password with salt (format: salt:hash)
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex')
  const hash = createHash(DIGEST)
    .update(password + salt)
    .digest('hex')
  return `${salt}:${hash}`
}

/**
 * Verify a password against a hash
 * @param password - Plain text password
 * @param hashedPassword - Stored hash (format: salt:hash)
 * @returns Whether the password matches
 */
export function verifyPassword(password: string, hashedPassword: string): boolean {
  const [salt, hash] = hashedPassword.split(':')
  if (!salt || !hash) return false

  const computedHash = createHash(DIGEST)
    .update(password + salt)
    .digest('hex')
  return computedHash === hash
}

/**
 * Generate JWT access token
 * @param payload - Token payload
 * @returns JWT token string
 */
export function generateAccessToken(payload: { userId: string; email: string; role: string }): string {
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      type: 'access'
    },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES_IN }
  )
}

/**
 * Generate JWT refresh token
 * @param payload - Token payload
 * @returns JWT token string
 */
export function generateRefreshToken(payload: { userId: string }): string {
  return jwt.sign(
    {
      userId: payload.userId,
      type: 'refresh'
    },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  )
}

/**
 * Verify and decode a JWT token
 * @param token - JWT token string
 * @returns Decoded token payload or null if invalid
 */
export function verifyToken(token: string): { userId: string; email: string; role: string; type: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return decoded
  } catch (error) {
    return null
  }
}

/**
 * Generate a secure random token
 * @param length - Token length in bytes
 * @returns Random token string
 */
export function generateRandomToken(length: number = 32): string {
  return randomBytes(length).toString('hex')
}

/**
 * Generate UUID v4
 * @returns UUID string
 */
export function generateUUID(): string {
  return randomBytes(16).toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
}
