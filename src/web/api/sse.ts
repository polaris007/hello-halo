/**
 * SSE (Server-Sent Events) 消费工具
 *
 * 用于消费 Agent 消息 API 返回的 SSE 流式响应。
 * 使用 fetch + ReadableStream 而非原生 EventSource，
 * 因为需要支持 POST 请求。
 */

import { getAuthToken, getServerUrl } from './transport'

// ============================================
// Types
// ============================================

/**
 * SSE 事件
 */
export interface SSEEvent {
  /** 事件名称（如 'message', 'thought', 'tool-call'） */
  event: string
  /** 事件数据（已解析的 JSON） */
  data: unknown
}

/**
 * 发送消息参数
 */
export interface SendMessageParams {
  /** 空间 ID */
  spaceId: string
  /** 对话 ID */
  conversationId: string
  /** 用户消息内容 */
  message: string
  /** 客户端生成的消息 ID（用于确保前后端消息 ID 一致） */
  clientMessageId?: string
  /** 图片附件（多模态） */
  images?: Array<{
    id: string
    type: 'image'
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    data: string
    name?: string
    size?: number
  }>
  /** 是否启用 AI 浏览器 */
  aiBrowserEnabled?: boolean
  /** 是否启用思考过程 */
  thinkingEnabled?: boolean
  /** Canvas 上下文 */
  canvasContext?: {
    isOpen: boolean
    tabCount: number
    activeTab: {
      type: string
      title: string
      url?: string
      path?: string
    } | null
    tabs: Array<{
      type: string
      title: string
      url?: string
      path?: string
      isActive: boolean
    }>
  }
}

/**
 * SSE 消费结果
 */
export interface SSEConsumerResult {
  /** 是否成功建立连接 */
  success: boolean
  /** 错误信息（如果失败） */
  error?: string
  /** HTTP 状态码 */
  statusCode?: number
}

// ============================================
// SSE Parser
// ============================================

/**
 * 解析 SSE 事件流
 *
 * SSE 规范要点：
 * 1. 事件以双换行 "\n\n" 分隔
 * 2. data 字段可以跨多行，每行以 "data:" 开头
 * 3. event 字段可选，默认为 "message"
 * 4. 多行 data 用换行符连接（HTML SSE 规范）
 *
 * @param buffer 输入缓冲区
 * @returns 解析结果：{ parsed: 已解析的事件数组, remaining: 未处理的剩余部分 }
 */
export function parseSSE(buffer: string): { parsed: SSEEvent[]; remaining: string } {
  const parsed: SSEEvent[] = []
  const lines = buffer.split('\n')
  let i = 0

  while (i < lines.length) {
    // 跳过空行
    if (lines[i] === '') {
      i++
      continue
    }

    // 从当前位置向后查找空行（事件结束标记）
    let eventEndIndex = i
    while (eventEndIndex < lines.length && lines[eventEndIndex] !== '') {
      eventEndIndex++
    }

    // 如果没有找到空行，说明事件不完整，保留在 buffer 中
    if (eventEndIndex >= lines.length) {
      break
    }

    // 解析这个完整的事件
    let eventType = 'message' // SSE 默认事件名
    const dataLines: string[] = []

    for (let j = i; j < eventEndIndex; j++) {
      const line = lines[j]

      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim()
      } else if (line.startsWith('data:')) {
        // SSE 规范：data: 后可选一个空格，只去掉这一个空格
        // 不能用 trim()，否则会去掉数据内容本身的空格
        let dataContent = line.substring(5)
        if (dataContent.startsWith(' ')) {
          dataContent = dataContent.substring(1)
        }
        dataLines.push(dataContent)
      }
    }

    // 合并多行 data（SSE 规范：用换行符连接）
    if (dataLines.length > 0) {
      const dataStr = dataLines.join('\n')
      try {
        parsed.push({
          event: eventType,
          data: JSON.parse(dataStr)
        })
      } catch (e) {
        console.error('[SSE] Failed to parse data JSON:', dataStr, e)
        parsed.push({
          event: eventType,
          data: { raw: dataStr, parseError: true }
        })
      }
    }

    // 移动到事件结束后的下一行
    i = eventEndIndex + 1
  }

  // 返回未处理的剩余部分
  const remaining = lines.slice(i).join('\n')
  return { parsed, remaining }
}

// ============================================
// SSE Consumer
// ============================================

/**
 * 发送消息并消费 SSE 流
 *
 * @param params 发送消息参数
 * @param onEvent 事件回调（每个解析后的事件都会调用）
 * @param onError 错误回调
 * @param signal 可选的 AbortSignal 用于取消请求
 * @returns 消费结果
 */
export async function sendMessageSSE(
  params: SendMessageParams,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal
): Promise<SSEConsumerResult> {
  const token = getAuthToken()
  const url = `${getServerUrl()}/api/v1/agent/message`

  console.log(`[SSE] POST ${url} - token: ${token ? 'present' : 'missing'}`)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(params),
      signal
    })

    // 非 200 响应表示请求级别的错误（认证失败、参数错误等）
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorData.error || errorMessage
      } catch {
        // 忽略 JSON 解析错误
      }

      // 401 需要清除 token
      if (response.status === 401) {
        console.warn('[SSE] 401 Unauthorized')
      }

      const error = new Error(errorMessage)
      onError(error)
      return { success: false, error: errorMessage, statusCode: response.status }
    }

    // 检查响应类型是否为 SSE
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
      const error = new Error(`Expected SSE stream, got ${contentType}`)
      onError(error)
      return { success: false, error: error.message }
    }

    // 读取 SSE 流
    const reader = response.body?.getReader()
    if (!reader) {
      const error = new Error('Response body is not readable')
      onError(error)
      return { success: false, error: error.message }
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 解析 SSE 事件
        const result = parseSSE(buffer)
        buffer = result.remaining

        for (const event of result.parsed) {
          onEvent(event)
        }
      }

      // 处理剩余的 buffer（可能有未完成的事件）
      if (buffer.trim()) {
        const result = parseSSE(buffer + '\n\n') // 添加结束标记
        for (const event of result.parsed) {
          onEvent(event)
        }
      }

      return { success: true }
    } catch (readError) {
      // 检查是否为取消错误
      if (readError instanceof Error && readError.name === 'AbortError') {
        console.log('[SSE] Request aborted')
        return { success: false, error: 'Request aborted' }
      }

      const error = readError instanceof Error ? readError : new Error('Stream read error')
      onError(error)
      return { success: false, error: error.message }
    }
  } catch (fetchError) {
    // 检查是否为取消错误
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      console.log('[SSE] Request aborted')
      return { success: false, error: 'Request aborted' }
    }

    const error = fetchError instanceof Error ? fetchError : new Error('Network error')
    console.error('[SSE] Fetch error:', error)
    onError(error)
    return { success: false, error: error.message }
  }
}

/**
 * 检查 SSE 事件是否为错误事件
 */
export function isSSEErrorEvent(event: SSEEvent): boolean {
  return event.event === 'error'
}

/**
 * 检查 SSE 事件是否为完成事件
 */
export function isSSECompleteEvent(event: SSEEvent): boolean {
  return event.event === 'complete'
}

/**
 * 从 SSE 事件数据中提取错误类型
 */
export function getSSEErrorType(event: SSEEvent): string | undefined {
  const data = event.data as Record<string, unknown>
  return data?.errorType as string | undefined
}

/**
 * 从 SSE 事件数据中提取错误消息
 */
export function getSSEErrorMessage(event: SSEEvent): string | undefined {
  const data = event.data as Record<string, unknown>
  return data?.error as string | undefined
}
