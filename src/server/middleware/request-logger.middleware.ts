/**
 * HTTP请求/响应日志中间件
 * 记录详细的HTTP请求和响应信息，支持敏感信息脱敏和大小限制
 */

import { Request, Response, NextFunction } from 'express'
import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { logger } from '../utils/logger.js'

// 获取API日志目录
function getApiLogDir(): string {
  const logDir = process.env.HELLO_LOG_DIR || join(process.cwd(), 'logs')
  return logDir
}

// 格式化本地时间戳
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

// 获取当前日期的API日志文件路径（使用本地时间）
function getApiLogFilePath(): string {
  const logDir = getApiLogDir()
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const currentDate = `${year}-${month}-${day}`

  // 确保目录存在
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  return join(logDir, `api-${currentDate}.log`)
}

// 检查是否应该记录详细报文
function shouldLogApiDetails(): boolean {
  if (process.env.HELLO_LOG_API_DETAIL !== undefined) {
    const value = process.env.HELLO_LOG_API_DETAIL.toLowerCase()
    return value === 'true' || value === '1' || value === 'yes'
  }
  // 默认记录详细报文
  return true
}

// 检查是否应该排除特定端点
function shouldExcludeEndpoint(url: string): boolean {
  const excludedEndpoints = ['/health', '/ready', '/favicon.ico']
  return excludedEndpoints.some(endpoint => url.startsWith(endpoint))
}

// 脱敏敏感头信息
function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'apikey',
    'password',
    'secret',
    'token'
  ]

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase()

    // 检查是否为敏感头
    if (sensitiveHeaders.some(sensitive => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]'
    } else if (value !== undefined) {
      sanitized[key] = Array.isArray(value) ? value.join(', ') : value.toString()
    }
  }

  return sanitized
}

// 截断大内容
function truncateContent(content: string, maxLength: number = 1048576): string { // 1MB = 1048576 bytes
  if (content.length <= maxLength) {
    return content
  }
  return content.substring(0, maxLength) + '...[TRUNCATED]'
}

// 解析请求体（支持JSON和文本）
async function parseRequestBody(req: Request): Promise<string> {
  return new Promise((resolve) => {
    // 如果已经解析过body（如body-parser中间件已处理）
    if (req.body) {
      try {
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        resolve(body)
      } catch {
        resolve('[Non-serializable body]')
      }
      return
    }

    // 如果没有body或body-parser未处理
    resolve('')
  })
}

// 解析响应体
function parseResponseBody(res: Response): string {
  const originalSend = res.send
  let responseBody = ''

  res.send = function(body: any): Response {
    try {
      if (body) {
        responseBody = typeof body === 'string' ? body : JSON.stringify(body)
      }
    } catch {
      responseBody = '[Non-serializable response]'
    }
    return originalSend.call(this, body)
  }

  return responseBody
}

// 获取客户端IP
function getClientIp(req: Request): string {
  return req.ip ||
         req.headers['x-forwarded-for'] as string ||
         req.socket.remoteAddress ||
         'unknown'
}

// 记录API日志（结构化文本格式）
function logApiRequestResponse(
  req: Request,
  res: Response,
  responseBody: string,
  duration: number
): void {
  try {
    // 检查是否应该记录详细报文
    if (!shouldLogApiDetails()) {
      return
    }

    // 检查是否应该排除此端点
    if (shouldExcludeEndpoint(req.url)) {
      return
    }

    const timestamp = formatLocalTimestamp()
    const clientIp = getClientIp(req)
    const sanitizedHeaders = sanitizeHeaders(req.headers)
    const truncatedRequestBody = req.body ? truncateContent(typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : ''
    const truncatedResponseBody = truncateContent(responseBody)

    // 构建日志行
    const logLines: string[] = []

    // 主日志行：[timestamp] [INFO] HTTP 请求: {method} {url} - {statusCode} - {duration}ms - {clientIp}
    logLines.push(`[${timestamp}] [INFO] HTTP 请求: ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms - ${clientIp}`)

    // 详细信息在单独行记录
    logLines.push(`[${timestamp}] [INFO]   请求头: ${JSON.stringify(sanitizedHeaders)}`)
    if (truncatedRequestBody) {
      logLines.push(`[${timestamp}] [INFO]   请求体: ${truncatedRequestBody}`)
    }
    if (truncatedResponseBody) {
      logLines.push(`[${timestamp}] [INFO]   响应体: ${truncatedResponseBody}`)
    }

    // 写入日志文件
    const logFilePath = getApiLogFilePath()
    const logContent = logLines.join('\n') + '\n'

    appendFileSync(logFilePath, logContent, 'utf-8')

  } catch (error) {
    logger.error('Failed to log API request/response:', error)
  }
}

// 请求日志中间件工厂函数
export function createRequestLoggerMiddleware() {
  return async function requestLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // 跳过特定端点
    if (shouldExcludeEndpoint(req.url)) {
      return next()
    }

    // 记录开始时间
    const startTime = Date.now()

    // 解析请求体
    const requestBody = await parseRequestBody(req)

    // 拦截响应发送以获取响应体
    let responseBody = ''
    const originalSend = res.send
    res.send = function(body: any): Response {
      try {
        if (body) {
          responseBody = typeof body === 'string' ? body : JSON.stringify(body)
        }
      } catch {
        responseBody = '[Non-serializable response]'
      }
      return originalSend.call(this, body)
    }

    // 响应完成时记录日志
    res.on('finish', () => {
      const duration = Date.now() - startTime
      logApiRequestResponse(req, res, responseBody, duration)
    })

    next()
  }
}

// 默认导出的中间件
export const requestLoggerMiddleware = createRequestLoggerMiddleware()
export default requestLoggerMiddleware

// 导出辅助函数用于测试
export { sanitizeHeaders, truncateContent, shouldExcludeEndpoint, shouldLogApiDetails, getClientIp, getApiLogFilePath }