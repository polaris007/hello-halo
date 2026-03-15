/**
 * HTTP 请求/响应日志中间件测试
 *
 * 测试 HTTP 报文日志中间件的功能：
 * - 请求/响应日志记录
 * - 敏感信息脱敏
 * - 大内容截断
 * - 端点排除
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 测试日志目录
const TEST_LOG_DIR = join(tmpdir(), 'halo-test-api-logs', crypto.randomUUID())

// 模拟环境变量
const originalEnv = process.env

describe('Request Logger Middleware', () => {
  beforeEach(() => {
    // 清理并创建测试日志目录
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_LOG_DIR, { recursive: true })

    // 重置环境变量
    process.env = { ...originalEnv }
    process.env.HALO_LOG_DIR = TEST_LOG_DIR
    process.env.HALO_LOG_API_DETAIL = 'true'
  })

  afterEach(() => {
    // 清理测试日志目录
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true })
    }

    // 恢复环境变量
    process.env = originalEnv
  })

  describe('敏感信息脱敏', () => {
    it('应该脱敏 Authorization 头', async () => {
      const { sanitizeHeaders } = await import('../../../src/server/middleware/request-logger.middleware.js')

      const headers = {
        'authorization': 'Bearer secret-token-123',
        'content-type': 'application/json',
        'user-agent': 'TestClient/1.0'
      }

      const sanitized = sanitizeHeaders(headers)

      expect(sanitized['authorization']).toBe('[REDACTED]')
      expect(sanitized['content-type']).toBe('application/json')
      expect(sanitized['user-agent']).toBe('TestClient/1.0')
    })

    it('应该脱敏 Cookie 头', async () => {
      const { sanitizeHeaders } = await import('../../../src/server/middleware/request-logger.middleware.js')

      const headers = {
        'cookie': 'session=secret-session-id; token=abc123',
        'content-type': 'application/json'
      }

      const sanitized = sanitizeHeaders(headers)

      expect(sanitized['cookie']).toBe('[REDACTED]')
      expect(sanitized['content-type']).toBe('application/json')
    })

    it('应该脱敏 X-API-Key 头', async () => {
      const { sanitizeHeaders } = await import('../../../src/server/middleware/request-logger.middleware.js')

      const headers = {
        'x-api-key': 'secret-api-key',
        'content-type': 'application/json'
      }

      const sanitized = sanitizeHeaders(headers)

      expect(sanitized['x-api-key']).toBe('[REDACTED]')
      expect(sanitized['content-type']).toBe('application/json')
    })

    it('应该脱敏包含敏感关键词的自定义头', async () => {
      const { sanitizeHeaders } = await import('../../../src/server/middleware/request-logger.middleware.js')

      const headers = {
        'x-auth-token': 'secret-token',
        'x-secret-key': 'secret-value',
        'content-type': 'application/json'
      }

      const sanitized = sanitizeHeaders(headers)

      expect(sanitized['x-auth-token']).toBe('[REDACTED]')
      expect(sanitized['x-secret-key']).toBe('[REDACTED]')
      expect(sanitized['content-type']).toBe('application/json')
    })
  })

  describe('内容截断', () => {
    it('应该截断超过 1MB 的内容', async () => {
      const { truncateContent } = await import('../../../src/server/middleware/request-logger.middleware.js')

      // 创建 2MB 的内容
      const largeContent = 'X'.repeat(2 * 1024 * 1024)
      const truncated = truncateContent(largeContent)

      expect(truncated.length).toBeLessThan(largeContent.length)
      expect(truncated).toContain('...[TRUNCATED]')
    })

    it('不应该截断小于 1MB 的内容', async () => {
      const { truncateContent } = await import('../../../src/server/middleware/request-logger.middleware.js')

      const smallContent = 'Small content'
      const truncated = truncateContent(smallContent)

      expect(truncated).toBe(smallContent)
    })

    it('应该使用默认截断长度', async () => {
      const { truncateContent } = await import('../../../src/server/middleware/request-logger.middleware.js')

      // 创建刚好小于默认限制的内容
      const content = 'X'.repeat(1024 * 1024 - 1)
      const truncated = truncateContent(content)

      expect(truncated).toBe(content)
    })
  })

  describe('端点排除', () => {
    it('应该排除 /health 端点', async () => {
      const { shouldExcludeEndpoint } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldExcludeEndpoint('/health')).toBe(true)
      // /healthz 以 /health 开头，所以也会被排除
      expect(shouldExcludeEndpoint('/healthz')).toBe(true)
    })

    it('应该排除 /ready 端点', async () => {
      const { shouldExcludeEndpoint } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldExcludeEndpoint('/ready')).toBe(true)
    })

    it('应该排除 /favicon.ico 端点', async () => {
      const { shouldExcludeEndpoint } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldExcludeEndpoint('/favicon.ico')).toBe(true)
    })

    it('不应该排除普通 API 端点', async () => {
      const { shouldExcludeEndpoint } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldExcludeEndpoint('/api/v1/users')).toBe(false)
      expect(shouldExcludeEndpoint('/api/v1/logs/client')).toBe(false)
      expect(shouldExcludeEndpoint('/api/v1/spaces')).toBe(false)
    })
  })

  describe('API 详细日志配置', () => {
    it('HALO_LOG_API_DETAIL=false 时不应该记录详细报文', async () => {
      process.env.HALO_LOG_API_DETAIL = 'false'
      const { shouldLogApiDetails } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldLogApiDetails()).toBe(false)
    })

    it('HALO_LOG_API_DETAIL=true 时应该记录详细报文', async () => {
      process.env.HALO_LOG_API_DETAIL = 'true'
      const { shouldLogApiDetails } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldLogApiDetails()).toBe(true)
    })

    it('未设置 HALO_LOG_API_DETAIL 时默认记录详细报文', async () => {
      delete process.env.HALO_LOG_API_DETAIL
      const { shouldLogApiDetails } = await import('../../../src/server/middleware/request-logger.middleware.js')

      expect(shouldLogApiDetails()).toBe(true)
    })
  })

  describe('客户端 IP 获取', () => {
    it('应该从多个来源获取客户端 IP', async () => {
      const { getClientIp } = await import('../../../src/server/middleware/request-logger.middleware.js')

      // 模拟请求对象
      const mockReq1 = {
        ip: '192.168.1.1',
        headers: {},
        socket: { remoteAddress: '10.0.0.1' }
      }

      const mockReq2 = {
        ip: undefined,
        headers: { 'x-forwarded-for': '203.0.113.1' },
        socket: { remoteAddress: '10.0.0.1' }
      }

      const mockReq3 = {
        ip: undefined,
        headers: {},
        socket: { remoteAddress: '10.0.0.1' }
      }

      expect(getClientIp(mockReq1 as any)).toBe('192.168.1.1')
      expect(getClientIp(mockReq2 as any)).toBe('203.0.113.1')
      expect(getClientIp(mockReq3 as any)).toBe('10.0.0.1')
    })
  })
})
