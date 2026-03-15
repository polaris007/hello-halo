/**
 * AI交互日志工具
 * 记录发送给大模型的报文内容和返回内容
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { logger } from './logger.js'

// 获取AI日志目录
function getAiLogDir(): string {
  // 使用与server日志相同的目录
  const logDir = process.env.HALO_LOG_DIR || join(process.cwd(), 'logs')
  return logDir
}

// 获取当前日期的AI日志文件路径
function getAiLogFilePath(): string {
  const logDir = getAiLogDir()
  const currentDate = new Date().toISOString().split('T')[0]

  // 确保目录存在
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  return join(logDir, `ai-${currentDate}.log`)
}

// 检查是否应该记录详细AI交互
function shouldLogAiDetails(): boolean {
  if (process.env.HALO_LOG_AI_DETAIL !== undefined) {
    const value = process.env.HALO_LOG_AI_DETAIL.toLowerCase()
    return value === 'true' || value === '1' || value === 'yes'
  }
  // 默认记录详细AI交互
  return true
}

// 清理旧的AI日志文件
function cleanupOldAiLogs(): void {
  try {
    const logDir = getAiLogDir()
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
      // 检查是否匹配AI日志文件模式
      if (file.startsWith('ai-') && file.endsWith('.log')) {
        try {
          // 从文件名提取日期: ai-YYYY-MM-DD.log
          const dateStr = file.substring(3, 13) // 获取YYYY-MM-DD部分
          const fileDate = new Date(dateStr)

          // 删除超过保留期限的文件
          if (fileDate < cutoffDate) {
            const filePath = join(logDir, file)
            unlinkSync(filePath)
            logger.info(`[AI Logger] Deleted old AI log file: ${file}`)
          }
        } catch (error) {
          // 跳过日期格式无效的文件
          continue
        }
      }
    }
  } catch (error) {
    logger.error('[AI Logger] Error cleaning up old AI logs:', error)
  }
}

// 跟踪上次清理时间
let lastAiCleanupDate: string | null = null

// 获取当前日期的日志文件路径（带清理检查）
function getAiLogFilePathWithCleanup(): string {
  const currentDate = new Date().toISOString().split('T')[0]

  // 每天只清理一次
  if (lastAiCleanupDate !== currentDate) {
    cleanupOldAiLogs()
    lastAiCleanupDate = currentDate
  }

  return getAiLogFilePath()
}

// 获取AI日志的最大截断长度
function getAiLogMaxSize(): number {
  // 默认截断长度为2048个字符
  const defaultSize = 2048

  if (process.env.HALO_LOG_AI_MAX_SIZE !== undefined) {
    const envValue = parseInt(process.env.HALO_LOG_AI_MAX_SIZE, 10)
    if (!isNaN(envValue) && envValue > 0) {
      return envValue
    }
  }

  return defaultSize
}

// 截断大内容
function truncateContent(content: string): string {
  // 内容小于10KB时不截断
  if (content.length <= 10240) {
    return content
  }

  // 超过10KB时截断到指定长度
  const maxLength = getAiLogMaxSize()
  return content.substring(0, maxLength) + '...[TRUNCATED]'
}

// 脱敏敏感信息（API密钥、访问令牌等）
function sanitizeAiRequest(request: any): any {
  if (!request || typeof request !== 'object') {
    return request
  }

  const sanitized = JSON.parse(JSON.stringify(request)) // Deep clone

  // 脱敏敏感字段
  const sensitiveFields = [
    'apiKey',
    'api_key',
    'accessToken',
    'access_token',
    'token',
    'authorization',
    'secret',
    'password'
  ]

  function sanitizeObject(obj: any): void {
    if (!obj || typeof obj !== 'object') return

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()

      // 检查是否为敏感字段（使用小写匹配）
      if (sensitiveFields.some(sensitive => lowerKey === sensitive.toLowerCase() || lowerKey.includes(sensitive.toLowerCase()))) {
        if (typeof value === 'string' && value.length > 0) {
          obj[key] = '[REDACTED]'
        }
      } else if (typeof value === 'object' && value !== null) {
        // 递归处理嵌套对象
        sanitizeObject(value)
      }
    }
  }

  sanitizeObject(sanitized)
  return sanitized
}

// AI请求日志接口
export interface AiRequestLog {
  timestamp: string
  type: 'ai_request'
  requestId: string
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
  request: {
    content: string
    sanitizedContent: string
    length: number
  }
  duration?: number
  status: 'sent' | 'error' | 'completed'
}

// AI响应日志接口
export interface AiResponseLog {
  timestamp: string
  type: 'ai_response'
  requestId: string
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
  response: {
    content: string
    sanitizedContent: string
    length: number
  }
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
  duration: number
  status: 'success' | 'error'
  error?: string
}

// AI流式响应chunk日志接口
export interface AiStreamChunkLog {
  timestamp: string
  type: 'ai_stream_chunk'
  requestId: string
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
  chunk: {
    type: string  // text_delta、thinking_delta等
    content: string
    sanitizedContent: string
    length: number
  }
  chunkIndex: number
  totalChunks?: number
}

// 生成唯一的请求ID
function generateRequestId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// 记录AI请求
export function logAiRequest(params: {
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
  requestContent: any
  requestId?: string
}): string {
  const requestId = params.requestId || generateRequestId()

  // 检查是否应该记录详细AI交互
  if (!shouldLogAiDetails()) {
    return requestId
  }

  try {
    const timestamp = new Date().toISOString()
    const sanitizedRequest = sanitizeAiRequest(params.requestContent)

    // 将请求内容转换为字符串并截断
    const requestContentStr = JSON.stringify(params.requestContent)
    const truncatedRequestContent = truncateContent(requestContentStr)
    const sanitizedRequestStr = JSON.stringify(sanitizedRequest)
    const truncatedSanitizedRequest = truncateContent(sanitizedRequestStr)

    const logEntry: AiRequestLog = {
      timestamp,
      type: 'ai_request',
      requestId,
      model: params.model,
      userId: params.userId,
      spaceId: params.spaceId,
      conversationId: params.conversationId,
      request: {
        content: truncatedRequestContent,
        sanitizedContent: truncatedSanitizedRequest,
        length: requestContentStr.length
      },
      status: 'sent'
    }

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = JSON.stringify(logEntry) + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 也记录到server日志用于调试
    logger.info(`[AI Logger] AI request logged: ${requestId}, model: ${params.model}`)

  } catch (error) {
    logger.error('[AI Logger] Failed to log AI request:', error)
  }

  return requestId
}

// 记录AI响应
export function logAiResponse(params: {
  requestId: string
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
  responseContent: any
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
  duration: number
  status: 'success' | 'error'
  error?: string
}): void {
  // 检查是否应该记录详细AI交互
  if (!shouldLogAiDetails()) {
    return
  }

  try {
    const timestamp = new Date().toISOString()
    const sanitizedResponse = sanitizeAiRequest(params.responseContent)

    // 将响应内容转换为字符串并截断
    const responseContentStr = JSON.stringify(params.responseContent)
    const truncatedResponseContent = truncateContent(responseContentStr)
    const sanitizedResponseStr = JSON.stringify(sanitizedResponse)
    const truncatedSanitizedResponse = truncateContent(sanitizedResponseStr)

    const logEntry: AiResponseLog = {
      timestamp,
      type: 'ai_response',
      requestId: params.requestId,
      model: params.model,
      userId: params.userId,
      spaceId: params.spaceId,
      conversationId: params.conversationId,
      response: {
        content: truncatedResponseContent,
        sanitizedContent: truncatedSanitizedResponse,
        length: responseContentStr.length
      },
      tokenUsage: params.tokenUsage,
      duration: params.duration,
      status: params.status,
      error: params.error
    }

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = JSON.stringify(logEntry) + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 也记录到server日志用于调试
    const statusMsg = params.status === 'success' ? 'success' : `error: ${params.error || 'unknown'}`
    logger.info(`[AI Logger] AI response logged: ${params.requestId}, status: ${statusMsg}, duration: ${params.duration}ms`)

  } catch (error) {
    logger.error('[AI Logger] Failed to log AI response:', error)
  }
}

// 记录AI流式响应chunk
export function logAiStreamChunk(params: {
  requestId: string
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
  chunkContent: any
  chunkType: string
  chunkIndex: number
  totalChunks?: number
}): void {
  // 检查是否应该记录详细AI交互
  if (!shouldLogAiDetails()) {
    return
  }

  try {
    const timestamp = new Date().toISOString()
    const sanitizedChunk = sanitizeAiRequest(params.chunkContent)

    // 将chunk内容转换为字符串并截断
    const chunkContentStr = JSON.stringify(params.chunkContent)
    const truncatedChunkContent = truncateContent(chunkContentStr)
    const sanitizedChunkStr = JSON.stringify(sanitizedChunk)
    const truncatedSanitizedChunk = truncateContent(sanitizedChunkStr)

    const logEntry: AiStreamChunkLog = {
      timestamp,
      type: 'ai_stream_chunk',
      requestId: params.requestId,
      model: params.model,
      userId: params.userId,
      spaceId: params.spaceId,
      conversationId: params.conversationId,
      chunk: {
        type: params.chunkType,
        content: truncatedChunkContent,
        sanitizedContent: truncatedSanitizedChunk,
        length: chunkContentStr.length
      },
      chunkIndex: params.chunkIndex,
      totalChunks: params.totalChunks
    }

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = JSON.stringify(logEntry) + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 也记录到server日志用于调试（频率较低，避免日志过多）
    if (params.chunkIndex % 10 === 0 || params.chunkIndex === 0) {
      logger.info(`[AI Logger] AI stream chunk logged: ${params.requestId}, chunk ${params.chunkIndex}, type: ${params.chunkType}`)
    }

  } catch (error) {
    logger.error('[AI Logger] Failed to log AI stream chunk:', error)
  }
}

// AI日志包装器，用于包装AI调用
export function createAiLoggerWrapper(params: {
  model: string
  userId?: string
  spaceId?: string
  conversationId?: string
}): {
  logRequest: (requestContent: any) => string
  logResponse: (responseContent: any, tokenUsage?: any, error?: string) => void
  logStreamChunk: (chunkContent: any, chunkType: string, chunkIndex: number, totalChunks?: number) => void
} {
  const { model, userId, spaceId, conversationId } = params

  return {
    logRequest: (requestContent: any): string => {
      return logAiRequest({
        model,
        userId,
        spaceId,
        conversationId,
        requestContent
      })
    },

    logResponse: (responseContent: any, tokenUsage?: any, error?: string): void => {
      // 注意：调用者需要自己计算duration
      logAiResponse({
        requestId: '', // 需要在调用时提供
        model,
        userId,
        spaceId,
        conversationId,
        responseContent,
        tokenUsage,
        duration: 0, // 需要在调用时提供
        status: error ? 'error' : 'success',
        error
      })
    },

    logStreamChunk: (chunkContent: any, chunkType: string, chunkIndex: number, totalChunks?: number): void => {
      // 注意：调用者需要自己提供requestId
      logAiStreamChunk({
        requestId: '', // 需要在调用时提供
        model,
        userId,
        spaceId,
        conversationId,
        chunkContent,
        chunkType,
        chunkIndex,
        totalChunks
      })
    }
  }
}

export default {
  logAiRequest,
  logAiResponse,
  logAiStreamChunk,
  createAiLoggerWrapper,
  cleanupOldAiLogs
}

// 导出辅助函数用于测试
export { cleanupOldAiLogs, truncateContent, sanitizeAiRequest, shouldLogAiDetails, getAiLogMaxSize }