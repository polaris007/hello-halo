/**
 * 日志 API 路由
 * 提供客户端日志接收和服务器日志查询功能
 */

import { Router, Request, Response } from 'express'
import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { logger } from '../utils/logger.js'

const router = Router()

// 获取日志目录
function getClientLogDir(): string {
  // 使用与server日志相同的目录
  const logDir = process.env.HALO_LOG_DIR || join(process.cwd(), 'logs')
  const clientLogDir = join(logDir, 'client')

  if (!existsSync(clientLogDir)) {
    mkdirSync(clientLogDir, { recursive: true })
  }

  return clientLogDir
}

// 清理旧的client日志文件
function cleanupOldClientLogs(): void {
  try {
    const logDir = getClientLogDir()
    if (!existsSync(logDir)) {
      return
    }

    // 获取保留天数，使用与server相同的环境变量
    const retentionDays = process.env.HALO_LOG_RETENTION_DAYS
      ? parseInt(process.env.HALO_LOG_RETENTION_DAYS, 10)
      : 7

    if (isNaN(retentionDays) || retentionDays <= 0) {
      return
    }

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const files = readdirSync(logDir)
    for (const file of files) {
      // 检查是否匹配client日志文件模式
      if (file.startsWith('client-') && file.endsWith('.log')) {
        try {
          // 从文件名提取日期: client-YYYY-MM-DD.log
          const dateStr = file.substring(7, 17) // 获取YYYY-MM-DD部分
          const fileDate = new Date(dateStr)

          // 删除超过保留期限的文件
          if (fileDate < cutoffDate) {
            const filePath = join(logDir, file)
            unlinkSync(filePath)
            logger.info(`Deleted old client log file: ${file}`)
          }
        } catch (error) {
          // 跳过日期格式无效的文件
          continue
        }
      }
    }
  } catch (error) {
    logger.error('Error cleaning up old client logs:', error)
  }
}

// 跟踪上次清理时间
let lastCleanupDate: string | null = null

// 获取当前日期的日志文件路径
function getClientLogFilePath(): string {
  const logDir = getClientLogDir()
  const currentDate = new Date().toISOString().split('T')[0]

  // 每天只清理一次
  if (lastCleanupDate !== currentDate) {
    cleanupOldClientLogs()
    lastCleanupDate = currentDate
  }

  return join(logDir, `client-${currentDate}.log`)
}

/**
 * POST /api/v1/logs/client - 接收客户端日志
 */
router.post('/client', optionalAuthMiddleware, async (req: Request, res: Response) => {
  try {
    const { logs } = req.body

    // 验证请求体
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Logs array is required' }
      })
    }

    // 验证日志条目格式
    for (const log of logs) {
      if (!log.timestamp || !log.level || !log.message) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_LOG_FORMAT', message: 'Each log must have timestamp, level, and message' }
        })
      }
    }

    // 写入日志文件
    const logFilePath = getClientLogFilePath()
    const logContent = logs.map(log =>
      `[${log.timestamp}] [${log.level}] ${log.message} ${log.args ? JSON.stringify(log.args) : ''}`
    ).join('\n') + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 记录server日志
    logger.info(`Received ${logs.length} client logs`)

    res.json({
      success: true,
      data: { received: logs.length }
    })
  } catch (error: any) {
    console.error('Client logs error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/logs/server - 获取服务器日志信息
 */
router.get('/server', authMiddleware, async (req: Request, res: Response) => {
  try {
    const logDir = process.env.HALO_LOG_DIR || join(process.cwd(), 'logs')

    res.json({
      success: true,
      data: {
        logDirectory: logDir,
        currentLogFile: logger.getLogFilePath(),
        logLevel: process.env.HALO_LOG_LEVEL || 'INFO',
        consoleOutput: !process.env.HALO_LOG_CONSOLE || process.env.HALO_LOG_CONSOLE.toLowerCase() !== 'false'
      }
    })
  } catch (error: any) {
    console.error('Get server logs info error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }