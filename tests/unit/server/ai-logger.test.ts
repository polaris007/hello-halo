/**
 * AI 交互日志测试
 *
 * 测试 AI 日志记录功能：
 * - AI 请求日志记录
 * - AI 响应日志记录
 * - AI 流式响应 chunk 记录
 * - 敏感信息脱敏
 * - 大内容截断
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// 测试日志目录
const TEST_LOG_DIR = join(tmpdir(), 'halo-test-ai-logs', crypto.randomUUID())

// 模拟环境变量
const originalEnv = process.env

describe('AI Logger', () => {
  beforeEach(() => {
    // 清理并创建测试日志目录
    if (existsSync(TEST_LOG_DIR)) {
      rmSync(TEST_LOG_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_LOG_DIR, { recursive: true })

    // 重置环境变量
    process.env = { ...originalEnv }
    process.env.HALO_LOG_DIR = TEST_LOG_DIR
    process.env.HALO_LOG_AI_DETAIL = 'true'
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
    it('应该脱敏 API 密钥', async () => {
      const { sanitizeAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const request = {
        model: 'claude-sonnet-4-20250514',
        apiKey: 'sk-ant-secret-key-123',
        messages: [{ role: 'user', content: 'Hello' }]
      }

      const sanitized = sanitizeAiRequest(request)

      expect(sanitized.apiKey).toBe('[REDACTED]')
      expect(sanitized.model).toBe('claude-sonnet-4-20250514')
    })

    it('应该脱敏访问令牌', async () => {
      const { sanitizeAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const request = {
        model: 'claude-sonnet-4-20250514',
        accessToken: 'ya29.secret-token',
        messages: [{ role: 'user', content: 'Hello' }]
      }

      const sanitized = sanitizeAiRequest(request)

      expect(sanitized.accessToken).toBe('[REDACTED]')
      expect(sanitized.model).toBe('claude-sonnet-4-20250514')
    })

    it('应该脱敏嵌套对象中的敏感字段', async () => {
      const { sanitizeAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const request = {
        model: 'claude-sonnet-4-20250514',
        config: {
          apiKey: 'sk-ant-secret-key',
          endpoint: 'https://api.anthropic.com'
        },
        messages: [{ role: 'user', content: 'Hello' }]
      }

      const sanitized = sanitizeAiRequest(request)

      expect(sanitized.config.apiKey).toBe('[REDACTED]')
      expect(sanitized.config.endpoint).toBe('https://api.anthropic.com')
    })

    it('应该脱敏 authorization 字段', async () => {
      const { sanitizeAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const request = {
        model: 'claude-sonnet-4-20250514',
        headers: {
          authorization: 'Bearer secret-token'
        }
      }

      const sanitized = sanitizeAiRequest(request)

      expect(sanitized.headers.authorization).toBe('[REDACTED]')
    })
  })

  describe('内容截断', () => {
    it('应该截断超过 10KB 的内容', async () => {
      const { truncateContent } = await import('../../../src/server/utils/ai-logger.js')

      // 创建 20KB 的内容
      const largeContent = 'X'.repeat(20 * 1024)
      const truncated = truncateContent(largeContent)

      expect(truncated.length).toBeLessThan(largeContent.length)
      expect(truncated).toContain('...[TRUNCATED]')
    })

    it('不应该截断小于 10KB 的内容', async () => {
      const { truncateContent } = await import('../../../src/server/utils/ai-logger.js')

      const smallContent = 'Small content less than 10KB'
      const truncated = truncateContent(smallContent)

      expect(truncated).toBe(smallContent)
    })

    it('应该使用 HALO_LOG_AI_MAX_SIZE 配置截断长度', async () => {
      process.env.HALO_LOG_AI_MAX_SIZE = '512'
      const { truncateContent, getAiLogMaxSize } = await import('../../../src/server/utils/ai-logger.js')

      expect(getAiLogMaxSize()).toBe(512)
    })
  })

  describe('AI 请求日志记录', () => {
    it('应该记录 AI 请求到日志文件', async () => {
      const { logAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const requestId = logAiRequest({
        model: 'claude-sonnet-4-20250514',
        userId: 'test-user',
        spaceId: 'test-space',
        conversationId: 'test-conversation',
        requestContent: {
          messages: [{ role: 'user', content: 'Hello, Claude!' }],
          max_tokens: 1024
        }
      })

      // 验证生成了请求 ID
      expect(requestId).toMatch(/^ai-\d+-[a-z0-9]+$/)

      // 验证日志文件存在
      const currentDate = new Date().toISOString().split('T')[0]
      const logFilePath = join(TEST_LOG_DIR, `ai-${currentDate}.log`)
      expect(existsSync(logFilePath)).toBe(true)

      // 验证日志内容
      const logContent = readFileSync(logFilePath, 'utf-8')
      expect(logContent).toContain('ai_request')
      expect(logContent).toContain('claude-sonnet-4-20250514')
      expect(logContent).toContain('test-user')
    })

    it('应该在 HALO_LOG_AI_DETAIL=false 时不记录详细 AI 交互', async () => {
      process.env.HALO_LOG_AI_DETAIL = 'false'
      const { logAiRequest, shouldLogAiDetails } = await import('../../../src/server/utils/ai-logger.js')

      expect(shouldLogAiDetails()).toBe(false)

      const requestId = logAiRequest({
        model: 'claude-sonnet-4-20250514',
        requestContent: { messages: [{ role: 'user', content: 'Hello' }] }
      })

      // 仍然会生成请求 ID，但不会写入日志
      expect(requestId).toMatch(/^ai-\d+-[a-z0-9]+$/)
    })
  })

  describe('AI 响应日志记录', () => {
    it('应该记录 AI 响应到日志文件', async () => {
      const { logAiResponse, logAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      // 先记录请求获取请求 ID
      const requestId = logAiRequest({
        model: 'claude-sonnet-4-20250514',
        requestContent: { messages: [{ role: 'user', content: 'Hello' }] }
      })

      // 记录响应
      logAiResponse({
        requestId,
        model: 'claude-sonnet-4-20250514',
        userId: 'test-user',
        responseContent: {
          content: [{ type: 'text', text: 'Hello, human!' }],
          stop_reason: 'end_turn'
        },
        tokenUsage: {
          input: 10,
          output: 20,
          total: 30
        },
        duration: 1500,
        status: 'success'
      })

      // 验证日志文件存在
      const currentDate = new Date().toISOString().split('T')[0]
      const logFilePath = join(TEST_LOG_DIR, `ai-${currentDate}.log`)
      expect(existsSync(logFilePath)).toBe(true)

      // 验证日志内容
      const logContent = readFileSync(logFilePath, 'utf-8')
      expect(logContent).toContain('ai_request')
      expect(logContent).toContain('ai_response')
      expect(logContent).toContain('success')
      expect(logContent).toContain('1500') // duration
    })

    it('应该记录 AI 错误响应', async () => {
      const { logAiResponse, logAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const requestId = logAiRequest({
        model: 'claude-sonnet-4-20250514',
        requestContent: { messages: [{ role: 'user', content: 'Hello' }] }
      })

      logAiResponse({
        requestId,
        model: 'claude-sonnet-4-20250514',
        responseContent: { error: 'Rate limit exceeded' },
        duration: 100,
        status: 'error',
        error: 'Rate limit exceeded'
      })

      const currentDate = new Date().toISOString().split('T')[0]
      const logFilePath = join(TEST_LOG_DIR, `ai-${currentDate}.log`)
      const logContent = readFileSync(logFilePath, 'utf-8')

      expect(logContent).toContain('ai_response')
      expect(logContent).toContain('error')
      expect(logContent).toContain('Rate limit exceeded')
    })
  })

  describe('AI 流式响应 chunk 记录', () => {
    it('应该记录 AI 流式响应 chunk', async () => {
      const { logAiStreamChunk, logAiRequest } = await import('../../../src/server/utils/ai-logger.js')

      const requestId = logAiRequest({
        model: 'claude-sonnet-4-20250514',
        requestContent: { messages: [{ role: 'user', content: 'Hello' }] }
      })

      // 记录几个 chunk
      logAiStreamChunk({
        requestId,
        model: 'claude-sonnet-4-20250514',
        chunkContent: { delta: { text: 'Hello' } },
        chunkType: 'text_delta',
        chunkIndex: 0
      })

      logAiStreamChunk({
        requestId,
        model: 'claude-sonnet-4-20250514',
        chunkContent: { delta: { text: ' World' } },
        chunkType: 'text_delta',
        chunkIndex: 1
      })

      const currentDate = new Date().toISOString().split('T')[0]
      const logFilePath = join(TEST_LOG_DIR, `ai-${currentDate}.log`)
      expect(existsSync(logFilePath)).toBe(true)

      const logContent = readFileSync(logFilePath, 'utf-8')
      expect(logContent).toContain('ai_request')
      expect(logContent).toContain('ai_stream_chunk')
      expect(logContent).toContain('text_delta')
    })
  })

  describe('AI logger wrapper', () => {
    it('应该提供便捷的包装器接口', async () => {
      const { createAiLoggerWrapper } = await import('../../../src/server/utils/ai-logger.js')

      const logger = createAiLoggerWrapper({
        model: 'claude-sonnet-4-20250514',
        userId: 'test-user',
        spaceId: 'test-space',
        conversationId: 'test-conversation'
      })

      expect(logger).toHaveProperty('logRequest')
      expect(logger).toHaveProperty('logResponse')
      expect(logger).toHaveProperty('logStreamChunk')
    })
  })

  describe('日志保留策略', () => {
    it('应该清理超过保留期限的 AI 日志文件', async () => {
      process.env.HALO_LOG_RETENTION_DAYS = '7'
      const { cleanupOldAiLogs } = await import('../../../src/server/utils/ai-logger.js')

      // 创建旧的日志文件（模拟 10 天前的文件）
      const oldDate = new Date()
      oldDate.setDate(oldDate.getDate() - 10)
      const oldLogFile = join(TEST_LOG_DIR, `ai-${oldDate.toISOString().split('T')[0]}.log`)
      writeFileSync(oldLogFile, 'Old AI log content')

      // 创建新的日志文件（模拟 3 天前的文件）
      const newDate = new Date()
      newDate.setDate(newDate.getDate() - 3)
      const newLogFile = join(TEST_LOG_DIR, `ai-${newDate.toISOString().split('T')[0]}.log`)
      writeFileSync(newLogFile, 'New AI log content')

      // 验证文件都存在
      expect(existsSync(oldLogFile)).toBe(true)
      expect(existsSync(newLogFile)).toBe(true)

      // 执行清理
      cleanupOldAiLogs()

      // 验证旧文件被删除，新文件保留
      expect(existsSync(oldLogFile)).toBe(false)
      expect(existsSync(newLogFile)).toBe(true)
    })
  })

  describe('API Key 指纹生成', () => {
    it('应该为有效的 API Key 生成指纹', async () => {
      const { generateApiKeyFingerprint } = await import('../../../src/server/utils/ai-logger.js')

      const apiKey = 'sk-ant-api03-secret-key-1234567890'
      const fingerprint = generateApiKeyFingerprint(apiKey)

      // 指纹应该包含前缀、后缀和哈希
      expect(fingerprint).toContain('sk-ant-')
      expect(fingerprint).toContain('...')
      expect(fingerprint).toContain('(hash:')
      expect(fingerprint).not.toContain(apiKey) // 不应包含完整密钥
    })

    it('应该为空值返回 [NOT SET]', async () => {
      const { generateApiKeyFingerprint } = await import('../../../src/server/utils/ai-logger.js')

      expect(generateApiKeyFingerprint(undefined)).toBe('[NOT SET]')
      expect(generateApiKeyFingerprint(null)).toBe('[NOT SET]')
      expect(generateApiKeyFingerprint('')).toBe('[NOT SET]')
    })

    it('应该为短 API Key 生成指纹', async () => {
      const { generateApiKeyFingerprint } = await import('../../../src/server/utils/ai-logger.js')

      const shortKey = 'sk-123'
      const fingerprint = generateApiKeyFingerprint(shortKey)

      expect(fingerprint).toContain('sk-123')
      expect(fingerprint).toContain('(hash:')
    })

    it('应该为不同的 API Key 生成不同的指纹', async () => {
      const { generateApiKeyFingerprint } = await import('../../../src/server/utils/ai-logger.js')

      const key1 = 'sk-ant-api03-key1-1234567890'
      const key2 = 'sk-ant-api03-key2-0987654321'

      const fingerprint1 = generateApiKeyFingerprint(key1)
      const fingerprint2 = generateApiKeyFingerprint(key2)

      // 不同的密钥应该产生不同的指纹
      expect(fingerprint1).not.toBe(fingerprint2)
    })

    it('应该为相同的 API Key 生成相同的指纹', async () => {
      const { generateApiKeyFingerprint } = await import('../../../src/server/utils/ai-logger.js')

      const apiKey = 'sk-ant-api03-same-key-1234567890'

      const fingerprint1 = generateApiKeyFingerprint(apiKey)
      const fingerprint2 = generateApiKeyFingerprint(apiKey)

      // 相同的密钥应该产生相同的指纹
      expect(fingerprint1).toBe(fingerprint2)
    })

    it('指纹格式应该正确', async () => {
      const { generateApiKeyFingerprint } = await import('../../../src/server/utils/ai-logger.js')

      const apiKey = 'sk-ant-api03-test-key-12345678901234567890'
      const fingerprint = generateApiKeyFingerprint(apiKey)

      // 验证格式：prefix...suffix (hash: xxxxxxxx)
      const pattern = /^sk-ant-\.\.\.\d{4} \(hash: [a-f0-9]{8}\)$/
      expect(fingerprint).toMatch(pattern)
    })
  })
})

// 辅助函数
function writeFileSync(path: string, content: string): void {
  const { writeFileSync } = require('fs')
  writeFileSync(path, content)
}
