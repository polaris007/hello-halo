/**
 * Server Logger 测试
 *
 * 测试 server 日志配置变更的核心功能
 */

import { describe, it, expect } from 'vitest'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 测试日志目录
const TEST_LOG_DIR = join(tmpdir(), 'halo-test-logs', crypto.randomUUID())

// 获取本地时间的日期字符串 (YYYY-MM-DD)
function getLocalDateString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('Server Logger', () => {
  // 清理测试目录
  if (existsSync(TEST_LOG_DIR)) {
    rmSync(TEST_LOG_DIR, { recursive: true, force: true })
  }
  mkdirSync(TEST_LOG_DIR, { recursive: true })

  describe('日志目录配置', () => {
    it('应该使用 HALO_LOG_DIR 环境变量作为日志目录', async () => {
      process.env.HALO_LOG_DIR = TEST_LOG_DIR
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')
      expect(logger.getLogDirectory()).toBe(TEST_LOG_DIR)
    })
  })

  describe('日志级别配置', () => {
    it('DEBUG 级别应该记录所有日志', async () => {
      const testDir = join(TEST_LOG_DIR, 'debug')
      mkdirSync(testDir, { recursive: true })
      process.env.HALO_LOG_DIR = testDir
      process.env.HALO_LOG_LEVEL = 'DEBUG'
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')

      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warn message')
      logger.error('Error message')

      const logFilePath = logger.getLogFilePath()
      expect(existsSync(logFilePath)).toBe(true)

      const logContent = readFileSync(logFilePath, 'utf-8')
      expect(logContent).toContain('[DEBUG] Debug message')
      expect(logContent).toContain('[INFO] Info message')
      expect(logContent).toContain('[WARN] Warn message')
      expect(logContent).toContain('[ERROR] Error message')
    })
  })

  describe('日志轮转', () => {
    it('应该按天轮转日志文件（使用本地时间）', async () => {
      const testDir = join(TEST_LOG_DIR, 'rotation')
      mkdirSync(testDir, { recursive: true })
      process.env.HALO_LOG_DIR = testDir
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')

      logger.info('Test message')

      const logFilePath = logger.getLogFilePath()
      const currentDate = getLocalDateString()

      expect(logFilePath).toContain(`server-${currentDate}.log`)
      expect(existsSync(logFilePath)).toBe(true)
    })
  })

  describe('日志写入', () => {
    it('应该能够写入日志文件', async () => {
      const testDir = join(TEST_LOG_DIR, 'write')
      mkdirSync(testDir, { recursive: true })
      process.env.HALO_LOG_DIR = testDir
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')

      logger.info('Write test message')

      const logFilePath = logger.getLogFilePath()
      expect(existsSync(logFilePath)).toBe(true)

      const logContent = readFileSync(logFilePath, 'utf-8')
      expect(logContent).toContain('Write test message')
    })
  })

  describe('运行时设置日志目录', () => {
    it('应该允许运行时设置日志目录', async () => {
      const customDir = join(TEST_LOG_DIR, 'custom')
      mkdirSync(customDir, { recursive: true })
      process.env.HALO_LOG_DIR = customDir
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')

      // 在记录日志前设置目录
      logger.setLogDirectory(customDir)

      logger.info('Custom dir test')

      const logFilePath = logger.getLogFilePath()
      expect(logFilePath).toContain(customDir)
      expect(existsSync(logFilePath)).toBe(true)
    })
  })

  describe('时间戳格式', () => {
    it('应该使用本地系统时间格式（YYYY-MM-DDTHH:mm:ss.SSS）', async () => {
      const testDir = join(TEST_LOG_DIR, 'timestamp')
      mkdirSync(testDir, { recursive: true })
      process.env.HALO_LOG_DIR = testDir
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')

      logger.info('Timestamp test')

      const logFilePath = logger.getLogFilePath()
      const logContent = readFileSync(logFilePath, 'utf-8')

      // 验证时间戳格式：[YYYY-MM-DDTHH:mm:ss.SSS] [INFO]
      const timestampRegex = /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}\] \[INFO\] Timestamp test/
      expect(logContent).toMatch(timestampRegex)

      // 验证时间戳包含本地日期
      const localDate = getLocalDateString()
      expect(logContent).toContain(localDate)
    })

    it('时间戳不应该包含 UTC 时区标识（Z）', async () => {
      const testDir = join(TEST_LOG_DIR, 'no-utc')
      mkdirSync(testDir, { recursive: true })
      process.env.HALO_LOG_DIR = testDir
      process.env.HALO_LOG_CONSOLE = 'false'

      const { logger } = await import('../../../src/server/utils/logger.js')

      logger.info('No UTC test')

      const logFilePath = logger.getLogFilePath()
      const logContent = readFileSync(logFilePath, 'utf-8')

      // 验证时间戳不包含 Z（UTC 标识）
      const timestampLine = logContent.split('\n').find(line => line.includes('[INFO] No UTC test'))
      expect(timestampLine).toBeDefined()
      // 时间戳格式应该是 [YYYY-MM-DDTHH:mm:ss.SSS] 而不是 [YYYY-MM-DDTHH:mm:ss.SSSZ]
      expect(timestampLine).not.toMatch(/\.\d{3}Z\]/)
    })
  })
})
