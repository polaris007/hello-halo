/**
 * 系统 API 路由
 * 提供系统信息和版本查询功能
 */

import { Router, Request, Response } from 'express'
import { createRequire } from 'module'
import os from 'os'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware'

const require = createRequire(import.meta.url)
const router = Router()

/**
 * GET /api/v1/system/version - 获取系统版本
 */
router.get('/version', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    // 从 package.json 读取版本
    const packageJson = require('../../../package.json')

    res.json({
      success: true,
      data: {
        version: packageJson.version,
        name: packageJson.name,
        buildTime: process.env.BUILD_TIME || 'development'
      }
    })
  } catch (error: any) {
    console.error('Get version error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/system/info - 获取系统信息
 */
router.get('/info', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        memory: {
          total: os.totalmem(),
          free: os.freemem()
        },
        cpus: os.cpus().length
      }
    })
  } catch (error: any) {
    console.error('Get system info error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
