/**
 * SSE Writer 工具类
 *
 * 用于将 Agent 事件流转换为 Server-Sent Events (SSE) 格式。
 * SSE 格式规范：
 * - 每个事件由 `event:` 行和 `data:` 行组成
 * - 事件以双换行符 `\n\n` 分隔
 * - 多行 data 字段直接拼接
 */

import type { Response } from 'express'

// ============================================
// Types
// ============================================

/**
 * SSE 写入器接口
 */
export interface SseWriter {
  /**
   * 写入一个 SSE 事件
   * @param event 事件名称（如 'message', 'thought', 'tool-call'）
   * @param data 事件数据（将被序列化为 JSON）
   */
  writeEvent(event: string, data: unknown): void

  /**
   * 结束 SSE 流
   * 发送最终消息并关闭连接
   */
  end(): void

  /**
   * 检查连接是否已关闭
   */
  isClosed(): boolean
}

/**
 * SSE 写入器选项
 */
export interface SseWriterOptions {
  /** 是否在写入时刷新（默认 true） */
  flush?: boolean
  /** 心跳间隔（毫秒，0 表示禁用） */
  heartbeatInterval?: number
  /** 心跳事件名称（默认 'heartbeat'） */
  heartbeatEvent?: string
}

// ============================================
// Implementation
// ============================================

/**
 * 创建 SSE 写入器
 *
 * @param res Express Response 对象
 * @param options 配置选项
 * @returns SseWriter 实例
 *
 * @example
 * ```typescript
 * const sseWriter = createSseWriter(res)
 *
 * // 发送消息事件
 * sseWriter.writeEvent('message', {
 *   type: 'agent:message',
 *   content: 'Hello, world!',
 *   isStreaming: true
 * })
 *
 * // 结束流
 * sseWriter.end()
 * ```
 */
export function createSseWriter(res: Response, options: SseWriterOptions = {}): SseWriter {
  const {
    flush = true,
    heartbeatInterval = 0,
    heartbeatEvent = 'heartbeat'
  } = options

  let closed = false
  let heartbeatTimer: NodeJS.Timeout | null = null

  // 启动心跳定时器
  if (heartbeatInterval > 0) {
    heartbeatTimer = setInterval(() => {
      if (!closed) {
        writeSSE(res, heartbeatEvent, { timestamp: Date.now() }, flush)
      }
    }, heartbeatInterval)
  }

  /**
   * 清理资源
   */
  const cleanup = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  return {
    writeEvent(event: string, data: unknown) {
      if (closed) {
        console.warn('[SSE] Attempted to write to closed connection')
        return
      }

      try {
        writeSSE(res, event, data, flush)
      } catch (error) {
        console.error('[SSE] Write error:', error)
        cleanup()
        closed = true
      }
    },

    end() {
      if (closed) {
        return
      }

      cleanup()
      closed = true

      try {
        // 直接关闭连接，不再发送额外的 done 事件
        // 流结束由 agent:complete 事件表示（符合 OpenSpec 规范）
        res.end()
      } catch (error) {
        // 忽略结束时的错误（客户端可能已断开）
      }
    },

    isClosed() {
      return closed
    }
  }
}

/**
 * 写入单个 SSE 事件到响应流
 */
function writeSSE(res: Response, event: string, data: unknown, flush: boolean): void {
  // 格式化 SSE 事件
  // event: <event-name>\n
  // data: <json-data>\n
  // \n
  const jsonStr = JSON.stringify(data)
  const sseMessage = `event: ${event}\ndata: ${jsonStr}\n\n`

  res.write(sseMessage)

  // 刷新缓冲区，确保数据立即发送
  if (flush && typeof res.flush === 'function') {
    res.flush()
  }
}

/**
 * 设置 SSE 响应头
 *
 * @param res Express Response 对象
 */
export function setSSEHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // 禁用 Nginx 缓冲（确保实时推送）
  res.setHeader('X-Accel-Buffering', 'no')
  // 立即发送 headers
  res.flushHeaders()
}

/**
 * 解析 SSE 事件名称
 * 将 `agent:message` 转换为 `message`
 *
 * @param eventName 完整事件名称（如 'agent:message'）
 * @returns SSE 事件名称（如 'message'）
 */
export function toSSEEventName(eventName: string): string {
  // 移除 'agent:' 前缀
  if (eventName.startsWith('agent:')) {
    return eventName.substring(6)
  }

  // 如果事件名没有 agent: 前缀，记录警告（这可能是未来的事件类型）
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[SSE] Event name "${eventName}" does not have 'agent:' prefix. This is unexpected.`)
  }

  return eventName
}
