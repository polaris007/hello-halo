/**
 * Authentication API Routes
 * JWT-based authentication with register, login, refresh, logout
 */

import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.middleware'
import * as authService from '../services/auth.service'
import { logActivity } from '../utils/database'

const router = Router()

/**
 * POST /api/v1/auth/register - User registration
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Email and password are required' }
      })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Invalid email format' }
      })
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' }
      })
    }

    const result = await authService.register({ email, password, name })

    // Log activity
    logActivity(result.user.id, 'user.register', { email, name }, req.ip, req.headers['user-agent'])

    res.status(201).json({
      success: true,
      data: result
    })
  } catch (error: any) {
    if (error.message === 'Email already registered') {
      return res.status(409).json({
        success: false,
        error: { code: 'EMAIL_EXISTS', message: error.message }
      })
    }
    res.status(500).json({
      success: false,
      error: { code: 'REGISTER_FAILED', message: error.message }
    })
  }
})

/**
 * POST /api/v1/auth/login - User login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Email and password are required' }
      })
    }

    const result = await authService.login(email, password)

    // Log activity
    logActivity(result.user.id, 'user.login', { email }, req.ip, req.headers['user-agent'])

    res.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    if (error.message === 'Invalid credentials') {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
      })
    }
    if (error.message === 'Account locked') {
      return res.status(423).json({
        success: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'Account is locked. Please try again later.' }
      })
    }
    res.status(500).json({
      success: false,
      error: { code: 'LOGIN_FAILED', message: error.message }
    })
  }
})

/**
 * POST /api/v1/auth/refresh - Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Refresh token is required' }
      })
    }

    const result = await authService.refreshToken(refreshToken)

    res.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN', message: 'Invalid or expired refresh token' }
    })
  }
})

/**
 * POST /api/v1/auth/logout - User logout
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader?.replace('Bearer ', '')

    if (token) {
      await authService.logout(token)
    }

    // Log activity
    logActivity(req.userId!, 'user.logout', {}, req.ip, req.headers['user-agent'])

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'LOGOUT_FAILED', message: error.message }
    })
  }
})

/**
 * POST /api/v1/auth/change-password - Change password
 */
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    const userId = req.userId!

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Current password and new password are required' }
      })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'WEAK_PASSWORD', message: 'New password must be at least 8 characters' }
      })
    }

    await authService.changePassword(userId, currentPassword, newPassword)

    // Log activity
    logActivity(userId, 'user.change_password', {}, req.ip, req.headers['user-agent'])

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    if (error.message === 'Current password is incorrect') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: error.message }
      })
    }
    res.status(500).json({
      success: false,
      error: { code: 'CHANGE_PASSWORD_FAILED', message: error.message }
    })
  }
})

/**
 * GET /api/v1/auth/me - Get current user info
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await authService.getUserById(req.userId!)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      })
    }

    res.json({
      success: true,
      data: user
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
