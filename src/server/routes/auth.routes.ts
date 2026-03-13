/**
 * 认证相关 API 路由
 */

import { Router } from 'express'
import * as auth from '../services/auth.service'
import { authMiddleware, getAuthConfig } from '../middleware/auth.middleware'

const router = Router()

/**
 * POST /api/v1/auth/login - 用户登录
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '用户名和密码不能为空' }
      })
    }

    const result = await auth.login(username, password)

    res.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: { code: 'LOGIN_FAILED', message: error.message }
    })
  }
})

/**
 * POST /api/v1/auth/logout - 用户登出
 */
router.post('/logout', authMiddleware, (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (token) {
      auth.logout(token)
    }

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
 * GET /api/v1/auth/me - 获取当前用户信息
 */
router.get('/me', authMiddleware, (req, res) => {
  try {
    const user = auth.getUserById(req.userId!)

    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'USER_NOT_FOUND', message: '用户不存在' }
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

/**
 * GET /api/v1/auth/config - 获取认证配置
 */
router.get('/config', (req, res) => {
  try {
    const config = getAuthConfig()

    // 不返回敏感信息
    res.json({
      success: true,
      data: {
        mode: config.mode,
        headerName: config.headerName,
        // 不返回 simpleToken
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
