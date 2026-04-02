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
  const logDir = process.env.HELLO_LOG_DIR || join(process.cwd(), 'logs')
  return logDir
}

// 格式化本地时间戳（与API日志一致）
function formatLocalTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`
}

// 获取当前日期的AI日志文件路径（使用本地时间，与API日志一致）
function getAiLogFilePath(): string {
  const logDir = getAiLogDir()
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const currentDate = `${year}-${month}-${day}`

  // 确保目录存在
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  return join(logDir, `ai-${currentDate}.log`)
}

// 检查是否应该记录详细AI交互
function shouldLogAiDetails(): boolean {
  if (process.env.HELLO_LOG_AI_DETAIL !== undefined) {
    const value = process.env.HELLO_LOG_AI_DETAIL.toLowerCase()
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
    const retentionDays = process.env.HELLO_LOG_RETENTION_DAYS
      ? parseInt(process.env.HELLO_LOG_RETENTION_DAYS, 10)
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

  if (process.env.HELLO_LOG_AI_MAX_SIZE !== undefined) {
    const envValue = parseInt(process.env.HELLO_LOG_AI_MAX_SIZE, 10)
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

// 生成API Key指纹（用于追踪和调试，不暴露完整密钥）
function generateApiKeyFingerprint(apiKey: string | undefined | null): string {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
    return '[NOT SET]'
  }

  try {
    // 提取前缀（如 "sk-ant-", "sk-"）
    const prefixLength = Math.min(7, apiKey.length)
    const prefix = apiKey.substring(0, prefixLength)

    // 提取后4位
    const suffixLength = Math.min(4, apiKey.length - prefixLength)
    const suffix = suffixLength > 0 ? apiKey.substring(apiKey.length - suffixLength) : ''

    // 生成短哈希（用于唯一标识，取前8位）
    const crypto = require('crypto')
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 8)

    // 格式：sk-ant-...xxxx (hash: a1b2c3d4)
    return `${prefix}...${suffix} (hash: ${hash})`
  } catch (error) {
    // 如果crypto不可用，使用简化版本
    const prefix = apiKey.substring(0, Math.min(7, apiKey.length))
    const suffix = apiKey.length > 7 ? apiKey.substring(apiKey.length - 4) : ''
    return `${prefix}...${suffix} (no-hash)`
  }
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

// 用户消息日志接口
export interface UserMessageLog {
  timestamp: string
  type: 'user_message'
  requestId: string
  userId?: string
  spaceId?: string
  conversationId?: string
  message: {
    content: string
    images: number
  }
}

// AI配置日志接口
export interface AiConfigLog {
  timestamp: string
  type: 'ai_config'
  requestId: string
  conversationId?: string
  config: {
    provider: string
    model: string
    displayModel?: string
    baseUrl?: string
    apiType?: string
    customHeaders?: Record<string, string> | null
    forceStream?: boolean
    filterContent?: boolean
    hasApiKey: boolean
    apiKeyFingerprint?: string  // API Key指纹，用于追踪
  }
}

// AI配置错误日志接口
export interface AiConfigErrorLog {
  timestamp: string
  type: 'ai_config_error'
  requestId: string
  conversationId?: string
  error: {
    type: string
    message: string
  }
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
export function generateRequestId(): string {
  return `ai-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// 记录用户消息
export function logUserMessage(params: {
  userId?: string
  spaceId?: string
  conversationId?: string
  messageContent: string
  imageCount?: number
  requestId?: string
}): string {
  const requestId = params.requestId || generateRequestId()

  // 检查是否应该记录详细AI交互
  if (!shouldLogAiDetails()) {
    return requestId
  }

  try {
    // 脱敏用户消息内容
    const sanitizedContent = sanitizeTextContent(params.messageContent)

    // 截断大内容
    const truncatedContent = truncateContent(sanitizedContent)

    // 格式化日志（与API日志格式一致）
    const timestamp = formatLocalTimestamp()
    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] AI 用户消息: {requestId} - {type} - {conversationId}
    logLines.push(`[${timestamp}] [INFO] AI 用户消息: ${requestId} - user_message - ${params.conversationId || 'no-conversation'}`)

    // 详细信息在单独行记录
    if (params.userId) {
      logLines.push(`[${timestamp}] [INFO]   用户ID: ${params.userId}`)
    }
    if (params.spaceId) {
      logLines.push(`[${timestamp}] [INFO]   空间ID: ${params.spaceId}`)
    }
    logLines.push(`[${timestamp}] [INFO]   消息内容: ${truncatedContent}`)
    logLines.push(`[${timestamp}] [INFO]   图片数量: ${params.imageCount || 0}`)

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = logLines.join('\n') + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 也记录到server日志用于调试
    logger.info(`[AI Logger] User message logged: ${requestId}, conversationId: ${params.conversationId}`)

  } catch (error) {
    logger.error('[AI Logger] Failed to log user message:', error)
  }

  return requestId
}

// 记录AI配置
export function logAiConfig(params: {
  conversationId?: string
  requestId: string
  config: {
    provider: string
    model: string
    displayModel?: string
    baseUrl?: string
    apiType?: string
    customHeaders?: Record<string, string> | null
    forceStream?: boolean
    filterContent?: boolean
    apiKey?: string
  }
}): void {
  // 检查是否应该记录详细AI交互
  if (!shouldLogAiDetails()) {
    return
  }

  try {
    const timestamp = formatLocalTimestamp()
    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] AI 配置: {requestId} - {type} - {conversationId}
    logLines.push(`[${timestamp}] [INFO] AI 配置: ${params.requestId} - ai_config - ${params.conversationId || 'no-conversation'}`)

    // 配置详情
    logLines.push(`[${timestamp}] [INFO]   提供商: ${params.config.provider}`)
    logLines.push(`[${timestamp}] [INFO]   模型: ${params.config.model}`)
    if (params.config.displayModel) {
      logLines.push(`[${timestamp}] [INFO]   显示模型: ${params.config.displayModel}`)
    }
    if (params.config.baseUrl) {
      logLines.push(`[${timestamp}] [INFO]   API地址: ${params.config.baseUrl}`)
    }
    if (params.config.apiType) {
      logLines.push(`[${timestamp}] [INFO]   API类型: ${params.config.apiType}`)
    }
    if (params.config.customHeaders && Object.keys(params.config.customHeaders).length > 0) {
      logLines.push(`[${timestamp}] [INFO]   自定义头: ${JSON.stringify(params.config.customHeaders)}`)
    }
    if (params.config.forceStream !== undefined) {
      logLines.push(`[${timestamp}] [INFO]   强制流式: ${params.config.forceStream}`)
    }
    if (params.config.filterContent !== undefined) {
      logLines.push(`[${timestamp}] [INFO]   过滤内容: ${params.config.filterContent}`)
    }
    // 记录API Key指纹（用于追踪，不暴露完整密钥）
    const apiKeyFingerprint = generateApiKeyFingerprint(params.config.apiKey)
    logLines.push(`[${timestamp}] [INFO]   API密钥指纹: ${apiKeyFingerprint}`)

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = logLines.join('\n') + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 也记录到server日志用于调试
    logger.info(`[AI Logger] AI config logged: ${params.requestId}, provider: ${params.config.provider}, model: ${params.config.model}`)

  } catch (error) {
    logger.error('[AI Logger] Failed to log AI config:', error)
  }
}

// 记录AI配置错误
export function logAiConfigError(params: {
  conversationId?: string
  requestId: string
  errorType: string
  errorMessage: string
}): void {
  // 检查是否应该记录详细AI交互
  if (!shouldLogAiDetails()) {
    return
  }

  try {
    const timestamp = formatLocalTimestamp()
    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] AI 配置错误: {requestId} - {type} - {conversationId}
    logLines.push(`[${timestamp}] [INFO] AI 配置错误: ${params.requestId} - ai_config_error - ${params.conversationId || 'no-conversation'}`)

    // 错误详情
    logLines.push(`[${timestamp}] [INFO]   错误类型: ${params.errorType}`)
    logLines.push(`[${timestamp}] [INFO]   错误信息: ${params.errorMessage}`)

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = logLines.join('\n') + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

    // 也记录到server日志用于调试
    logger.error(`[AI Logger] AI config error logged: ${params.requestId}, error: ${params.errorType} - ${params.errorMessage}`)

  } catch (error) {
    logger.error('[AI Logger] Failed to log AI config error:', error)
  }
}

// 脱敏文本内容（用于用户消息等）
function sanitizeTextContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return content
  }

  let sanitized = content

  // 脱敏API密钥（sk-开头的字符串）
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED]')

  // 脱敏密码相关的模式
  sanitized = sanitized.replace(/password["\s]*[:=]["\s]*[^"',}\s]+/gi, 'password": "[REDACTED]"')
  sanitized = sanitized.replace(/secret["\s]*[:=]["\s]*[^"',}\s]+/gi, 'secret": "[REDACTED]"')
  sanitized = sanitized.replace(/token["\s]*[:=]["\s]*[^"',}\s]+/gi, 'token": "[REDACTED]"')

  return sanitized
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
    const timestamp = formatLocalTimestamp()
    const sanitizedRequest = sanitizeAiRequest(params.requestContent)

    // 将请求内容转换为字符串并截断
    const requestContentStr = JSON.stringify(params.requestContent)
    const truncatedRequestContent = truncateContent(requestContentStr)
    const sanitizedRequestStr = JSON.stringify(sanitizedRequest)
    const truncatedSanitizedRequest = truncateContent(sanitizedRequestStr)

    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] AI 请求: {requestId} - {type} - {conversationId}
    logLines.push(`[${timestamp}] [INFO] AI 请求: ${requestId} - ai_request - ${params.conversationId || 'no-conversation'}`)

    // 请求详情
    logLines.push(`[${timestamp}] [INFO]   模型: ${params.model}`)
    if (params.userId) {
      logLines.push(`[${timestamp}] [INFO]   用户ID: ${params.userId}`)
    }
    if (params.spaceId) {
      logLines.push(`[${timestamp}] [INFO]   空间ID: ${params.spaceId}`)
    }
    logLines.push(`[${timestamp}] [INFO]   请求内容长度: ${requestContentStr.length}`)
    logLines.push(`[${timestamp}] [INFO]   请求内容(原始): ${truncatedRequestContent}`)
    logLines.push(`[${timestamp}] [INFO]   请求内容(脱敏): ${truncatedSanitizedRequest}`)
    logLines.push(`[${timestamp}] [INFO]   状态: sent`)

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = logLines.join('\n') + '\n'

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
    const timestamp = formatLocalTimestamp()
    const sanitizedResponse = sanitizeAiRequest(params.responseContent)

    // 将响应内容转换为字符串并截断
    const responseContentStr = JSON.stringify(params.responseContent)
    const truncatedResponseContent = truncateContent(responseContentStr)
    const sanitizedResponseStr = JSON.stringify(sanitizedResponse)
    const truncatedSanitizedResponse = truncateContent(sanitizedResponseStr)

    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] AI 响应: {requestId} - {type} - {conversationId}
    logLines.push(`[${timestamp}] [INFO] AI 响应: ${params.requestId} - ai_response - ${params.conversationId || 'no-conversation'}`)

    // 响应详情
    logLines.push(`[${timestamp}] [INFO]   模型: ${params.model}`)
    if (params.userId) {
      logLines.push(`[${timestamp}] [INFO]   用户ID: ${params.userId}`)
    }
    if (params.spaceId) {
      logLines.push(`[${timestamp}] [INFO]   空间ID: ${params.spaceId}`)
    }
    logLines.push(`[${timestamp}] [INFO]   响应内容长度: ${responseContentStr.length}`)
    logLines.push(`[${timestamp}] [INFO]   响应内容(原始): ${truncatedResponseContent}`)
    logLines.push(`[${timestamp}] [INFO]   响应内容(脱敏): ${truncatedSanitizedResponse}`)
    logLines.push(`[${timestamp}] [INFO]   持续时间: ${params.duration}ms`)
    logLines.push(`[${timestamp}] [INFO]   状态: ${params.status}`)

    if (params.tokenUsage) {
      logLines.push(`[${timestamp}] [INFO]   输入tokens: ${params.tokenUsage.input}`)
      logLines.push(`[${timestamp}] [INFO]   输出tokens: ${params.tokenUsage.output}`)
      logLines.push(`[${timestamp}] [INFO]   总tokens: ${params.tokenUsage.total}`)
    }

    if (params.error) {
      logLines.push(`[${timestamp}] [INFO]   错误: ${params.error}`)
    }

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = logLines.join('\n') + '\n'

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
    const timestamp = formatLocalTimestamp()
    const sanitizedChunk = sanitizeAiRequest(params.chunkContent)

    // 将chunk内容转换为字符串并截断
    const chunkContentStr = JSON.stringify(params.chunkContent)
    const truncatedChunkContent = truncateContent(chunkContentStr)
    const sanitizedChunkStr = JSON.stringify(sanitizedChunk)
    const truncatedSanitizedChunk = truncateContent(sanitizedChunkStr)

    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] AI 流式chunk: {requestId} - {type} - {chunkIndex}
    logLines.push(`[${timestamp}] [INFO] AI 流式chunk: ${params.requestId} - ai_stream_chunk - chunk ${params.chunkIndex}`)

    // chunk详情
    logLines.push(`[${timestamp}] [INFO]   模型: ${params.model}`)
    if (params.userId) {
      logLines.push(`[${timestamp}] [INFO]   用户ID: ${params.userId}`)
    }
    if (params.spaceId) {
      logLines.push(`[${timestamp}] [INFO]   空间ID: ${params.spaceId}`)
    }
    if (params.conversationId) {
      logLines.push(`[${timestamp}] [INFO]   会话ID: ${params.conversationId}`)
    }
    logLines.push(`[${timestamp}] [INFO]   chunk类型: ${params.chunkType}`)
    logLines.push(`[${timestamp}] [INFO]   chunk内容长度: ${chunkContentStr.length}`)
    logLines.push(`[${timestamp}] [INFO]   chunk内容(原始): ${truncatedChunkContent}`)
    logLines.push(`[${timestamp}] [INFO]   chunk内容(脱敏): ${truncatedSanitizedChunk}`)
    if (params.totalChunks !== undefined) {
      logLines.push(`[${timestamp}] [INFO]   总chunks: ${params.totalChunks}`)
    }

    // 写入日志文件
    const logFilePath = getAiLogFilePathWithCleanup()
    const logContent = logLines.join('\n') + '\n'

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
  logUserMessage,
  logAiConfig,
  logAiConfigError,
  logAiRequest,
  logAiResponse,
  logAiStreamChunk,
  createAiLoggerWrapper,
  cleanupOldAiLogs,
  generateRequestId
}

// 导出辅助函数用于测试
export { cleanupOldAiLogs, truncateContent, sanitizeAiRequest, shouldLogAiDetails, getAiLogMaxSize, generateApiKeyFingerprint }