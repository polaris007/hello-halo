## Context

### 当前状态

Agent 消息 API 的数据流：
```
前端 POST /api/v1/agent/message
    ↓
后端 agent.routes.ts 调用 sendMessage()
    ↓
后端立即返回 JSON { success: true, data: { messageId, status: "processing" } }
    ↓
sendMessage() 通过 sendToRenderer() 推送事件
    ↓
sendToRenderer() 调用 websocketService.broadcastAgentEvent()
    ↓
WebSocket 推送给已订阅的前端客户端
```

**改进动机**：
1. **架构简化**：HTTP 请求与响应分离增加了调试和维护复杂度
2. **错误处理统一**：HTTP 错误（401、500）与 WebSocket 推送的 `agent:error` 需要分别处理
3. **调试体验**：无法通过单个网络请求追踪完整的请求-响应链路

### 约束

- 必须使用 SSE（项目已决定替代 WebSocket）
- 必须复用现有的 `stream-processor.ts` 逻辑
- API 请求参数不变，仅响应格式变更

## Goals / Non-Goals

**Goals:**
1. 将 `POST /api/v1/agent/message` 改为返回 SSE 流式响应
2. 前端能够实时接收 thinking、tool_use、text 等事件
3. 保持 AI 日志记录功能正常工作
4. 确保错误能通过 SSE 流正确传递给前端
5. 完全移除 WebSocket 对话相关代码

**Non-Goals:**
1. 对话列表功能（独立 change）
2. 多设备实时同步（未来需求）

## Decisions

### Decision 1: SSE 端点设计

**选择**: 使用 `POST /api/v1/agent/message` 直接返回 SSE 流

**理由**:
- 最简单的实现，无需额外端点
- 前端使用 `fetch` + `ReadableStream` 消费
- 复用现有认证中间件

**替代方案**:
- `GET /api/v1/agent/stream?conversationId=xxx` - 需要额外状态管理，复杂度更高
- WebSocket 双向通道 - 项目已决定不使用

**SSE 事件格式**（完整事件列表见 spec.md）:
```
event: message
data: {"type":"agent:message","spaceId":"...","conversationId":"...","content":"...","isStreaming":true}

event: thought
data: {"type":"agent:thought","spaceId":"...","conversationId":"...","thought":{...}}

event: thought-delta
data: {"type":"agent:thought-delta","spaceId":"...","conversationId":"...","thoughtId":"...","delta":"..."}

event: tool-call
data: {"type":"agent:tool-call","spaceId":"...","conversationId":"...","toolCall":{...}}

event: tool-result
data: {"type":"agent:tool-result","spaceId":"...","conversationId":"...","toolId":"...","result":"..."}

event: compact
data: {"type":"agent:compact","spaceId":"...","conversationId":"...","trigger":"auto","preTokens":12345}

event: complete
data: {"type":"agent:complete","spaceId":"...","conversationId":"...","tokenUsage":{...}}

event: error
data: {"type":"agent:error","spaceId":"...","conversationId":"...","error":"...","errorType":"...","errorCode":"..."}
```

### Decision 2: stream-processor.ts 改造

**选择**: 使用 SSE Writer 直接替代 `sendToRenderer()`

**改造方式**:
```typescript
// ProcessStreamParams 新增参数
interface ProcessStreamParams {
  // ... existing fields

  // SSE 模式（主对话）：提供 sseWriter
  sseWriter?: SseWriter

  // 回调模式（automation app）：提供 onEvent 回调
  onEvent?: (eventName: string, data: any) => void
}

// SseWriter 接口
interface SseWriter {
  writeEvent(event: string, data: any): void
  end(): void
}

// processStream 内部
function processStream(params: ProcessStreamParams) {
  const { sseWriter, onEvent, spaceId, conversationId, ... } = params

  // 统一的事件发送函数（支持 SSE 和回调两种模式）
  const emitEvent = (eventName: string, data: any) => {
    const eventData = { ...data, spaceId, conversationId }

    if (sseWriter) {
      // SSE 模式：写入 SSE 流
      const sseEventName = eventName.replace('agent:', '')
      sseWriter.writeEvent(sseEventName, eventData)
    }

    if (onEvent) {
      // 回调模式：调用回调函数（用于 automation app）
      onEvent(eventName, eventData)
    }
  }

  // 使用 emitEvent 替代所有 sendToRenderer 调用
  emitEvent('agent:message', { type: 'message', content: '...', isStreaming: true })
}
```

### Decision 3: 前端消费方式

**选择**: 使用 `fetch` + `ReadableStream` 而非原生 `EventSource`

**理由**:
- `EventSource` 只支持 GET 请求
- 需要 POST 发送消息内容（包括 `spaceId`, `conversationId`, `message`, `images` 等参数）
- `fetch` + `ReadableStream` 可以处理 POST + SSE

**前端代码示例**:
```typescript
import { getAuthToken } from './transport'

interface SSEEvent {
  event: string
  data: any
}

interface SendMessageParams {
  spaceId: string
  conversationId: string
  message: string
  images?: string[]
  aiBrowserEnabled?: boolean
  thinkingEnabled?: boolean
  canvasContext?: any
}

async function sendMessage(
  params: SendMessageParams,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Error) => void
): Promise<void> {
  const token = getAuthToken()
  const response = await fetch('/api/v1/agent/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(params)
  })

  // 非 200 响应表示请求级别的错误（认证失败、参数错误等）
  if (!response.ok) {
    try {
      const errorData = await response.json()
      onError(new Error(errorData.error?.message || `HTTP ${response.status}`))
    } catch {
      onError(new Error(`HTTP ${response.status}: ${response.statusText}`))
    }
    return
  }

  const reader = response.body!.getReader()
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
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Stream read error'))
  }
}

/**
 * 解析 SSE 事件流
 *
 * SSE 规范要点：
 * 1. 事件以双换行 "\n\n" 分隔
 * 2. data 字段可以跨多行，每行以 "data:" 开头
 * 3. event 字段可选，默认为 "message"
 * 4. 多行 data 用换行符连接（HTML SSE 规范）
 */
function parseSSE(buffer: string): { parsed: SSEEvent[]; remaining: string } {
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
    let dataLines: string[] = []

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
        console.error('Failed to parse SSE data JSON:', dataStr, e)
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

export { sendMessage, parseSSE }
export type { SSEEvent, SendMessageParams }
```

### Decision 4: 错误处理

**选择**: 错误通过 SSE `event: error` 发送，然后关闭流

**理由**:
- 前端统一处理所有事件
- 保持 HTTP 响应状态码为 200（SSE 规范）
- 错误内容在事件体中传递

**错误类型映射**：

| errorType | 触发条件 |
|-----------|---------|
| `rate_limit` | API 返回速率限制错误（errorCode 包含 `rate` 或 `limit`） |
| `auth_failure` | API Key 无效或过期（errorCode 包含 `auth`、`api_key` 或 `invalid_key`） |
| `interrupted` | 用户取消或网络中断 |
| `max_turns` | 达到 SDK maxTurns 限制 |
| `unknown` | 其他未知错误 |

**实现**:
```typescript
const getErrorType = (
  wasAborted: boolean,
  hadMaxTurnsReached: boolean,
  hasErrorThought: boolean,
  errorThought?: Thought,
  isInterrupted?: boolean
): string => {
  if (wasAborted) return 'interrupted'
  if (hadMaxTurnsReached) return 'max_turns'
  if (hasErrorThought && errorThought?.errorCode) {
    const code = errorThought.errorCode.toLowerCase()
    if (code.includes('rate') || code.includes('limit')) return 'rate_limit'
    if (code.includes('auth') || code.includes('api_key') || code.includes('invalid_key')) return 'auth_failure'
  }
  if (isInterrupted) return 'interrupted'
  return 'unknown'
}
```

### Decision 5: AbortController 管理

**选择**: 维护全局 `activeSSEStreams` 映射，使用 `try-finally` 模式确保资源释放

**责任边界设计**:
- **`req.on('close')` 回调**: 只负责 `abort()`，不负责删除映射
- **`finally` 块**: 只负责删除映射和清理等待状态，不重复 abort（abort 是幂等的，重复调用无害）
- **超时定时器**: 在创建 SSE 流时启动，在 `finally` 块中清理

**实现**:
```typescript
// 在 agent routes 中维护
const activeSSEStreams = new Map<string, {
  controller: AbortController
  timeoutId: NodeJS.Timeout
}>()

const SSE_TIMEOUT_MS = 30 * 60 * 1000 // 30 分钟

// POST /api/v1/agent/message 处理
router.post('/message', async (req, res) => {
  const { conversationId } = req.body

  // 1. 取消该 conversationId 的旧连接（如果有）
  const existing = activeSSEStreams.get(conversationId)
  if (existing) {
    clearTimeout(existing.timeoutId)
    existing.controller.abort()
    activeSSEStreams.delete(conversationId)
    sessionManager.cancelPendingInput(conversationId)
  }

  // 2. 创建新的 AbortController 和超时定时器
  const abortController = new AbortController()
  const timeoutId = setTimeout(() => {
    abortController.abort()
    sessionManager.cancelPendingInput(conversationId)
    console.log(`[Agent] Connection timeout: ${conversationId}`)
  }, SSE_TIMEOUT_MS)

  activeSSEStreams.set(conversationId, { controller: abortController, timeoutId })

  try {
    // 3. 设置 SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // 4. 监听连接断开 - 只负责 abort，不负责删除
    req.on('close', () => {
      abortController.abort()
      sessionManager.cancelPendingInput(conversationId)
    })

    // 5. 创建 SSE Writer 并执行 Agent
    const sseWriter = createSseWriter(res)
    await sendMessage({
      conversationId,
      sseWriter,
      abortController,
      // ... other params
    })

  } catch (error) {
    // 错误处理
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    }
  } finally {
    // 6. 清理超时定时器和映射
    const entry = activeSSEStreams.get(conversationId)
    if (entry) {
      clearTimeout(entry.timeoutId)
    }
    activeSSEStreams.delete(conversationId)
  }
})

// POST /api/v1/agent/stop 调用
router.post('/stop', async (req, res) => {
  const { conversationId } = req.body
  const entry = activeSSEStreams.get(conversationId)
  if (entry) {
    entry.controller.abort()
    sessionManager.cancelPendingInput(conversationId)
    // 注意：不要在这里删除或清理定时器，让 finally 块处理
  }
  res.json({ success: true })
})
```

**资源释放保证清单**:

| 场景 | 清理机制 | 说明 |
|-----|---------|------|
| 正常完成 | `finally` 块 | 清理定时器 + `activeSSEStreams.delete()` |
| 错误终止 | `finally` 块 | 同上 |
| 用户取消（/stop） | `finally` 块 | abort 触发错误后 finally 清理 |
| 客户端断开 | `req.on('close')` + `finally` | close 回调 abort，finally 清理 |
| 超时清理 | 超时定时器 abort + `finally` | 定时器触发 abort，finally 清理 |
| 新连接替换 | 新连接启动时主动取消 | 先清理定时器 + abort + delete + cancelPending |
| 等待超时 | `pendingInputResolvers` 超时 | 自动清理等待状态 |

### Decision 6: SSE 连接断开检测

**选择**: 使用 `req.on('close')` 事件

**实现**:
```typescript
// agent.routes.ts
req.on('close', () => {
  // 只负责 abort，映射删除由 finally 块处理
  abortController.abort()
  // 取消该对话的等待状态
  sessionManager.cancelPendingInput(conversationId)
  console.log(`[Agent] Client disconnected, aborting: ${conversationId}`)
})
```

**注意**: 不要在此处删除 `activeSSEStreams` 映射，这是 `finally` 块的职责。详见 Decision 5 的责任边界设计。

### Decision 7: 工具审批（Tool Approval）处理

**问题**: SSE 是单向通信，如何处理需要用户审批的工具调用？

**选择**: SSE 流保持打开，发送等待事件，用户通过独立 HTTP 端点提交审批结果

**流程**:
```
1. Agent 调用需要审批的工具（如 Bash、Edit）
2. SSE 流发送 event: tool-call，包含 requiresApproval: true
3. SSE 流发送 event: waiting-for-input，type: "tool-approval"
4. SSE 流暂停（不关闭），等待用户操作
5. 用户点击"批准"或"拒绝"
6. 前端调用 POST /api/v1/agent/approve 或 /reject
7. 后端收到请求后，继续 Agent 执行
8. SSE 流继续推送后续事件
```

**新事件格式**:
```typescript
// event: waiting-for-input
{
  "type": "waiting-for-input",
  "inputType": "tool-approval",
  "toolCallId": "tool-xxx",
  "toolName": "Bash",
  "message": "等待审批工具调用"
}
```

**核心实现机制**:

等待状态通过 Promise + Map 实现，存储在进程内存中：

```typescript
// session-manager.ts 中新增
// 等待输入的解析器映射 - key 为 conversationId
const pendingInputResolvers = new Map<string, {
  resolve: (value: any) => void
  reject: (reason: any) => void
  inputType: 'tool-approval' | 'ask-question'
  createdAt: number
  timeoutId?: NodeJS.Timeout
}>()

// SSE 流等待用户输入时
export async function waitForUserInput(
  conversationId: string,
  inputType: 'tool-approval' | 'ask-question',
  metadata: { toolCallId?: string; questionId?: string },
  timeoutMs: number = 5 * 60 * 1000 // 默认 5 分钟超时
): Promise<{ approved?: boolean; answers?: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeoutId = setTimeout(() => {
      pendingInputResolvers.delete(conversationId)
      reject(new Error('User input timeout'))
    }, timeoutMs)

    // 存储解析器，等待 HTTP 端点调用
    pendingInputResolvers.set(conversationId, {
      resolve: (value) => {
        clearTimeout(timeoutId)
        pendingInputResolvers.delete(conversationId)
        resolve(value)
      },
      reject: (reason) => {
        clearTimeout(timeoutId)
        pendingInputResolvers.delete(conversationId)
        reject(reason)
      },
      inputType,
      createdAt: Date.now(),
      timeoutId
    })
  })
}

// 供 HTTP 端点调用
export function resolveUserInput(
  conversationId: string,
  result: { approved?: boolean; answers?: Record<string, string> }
): boolean {
  const pending = pendingInputResolvers.get(conversationId)
  if (pending) {
    pending.resolve(result)
    return true
  }
  return false
}

// SSE 连接断开时清理
export function cancelPendingInput(conversationId: string) {
  const pending = pendingInputResolvers.get(conversationId)
  if (pending) {
    pending.reject(new Error('SSE connection closed'))
  }
}
```

**HTTP 端点修改**:
```typescript
// agent.routes.ts
router.post('/approve', async (req, res) => {
  const { conversationId } = req.body

  // 查找并解析等待中的 SSE 流
  const resolved = sessionManager.resolveUserInput(conversationId, { approved: true })

  if (resolved) {
    res.json({ success: true, message: 'Approval submitted, SSE stream continues' })
  } else {
    res.status(404).json({ error: 'No pending approval for this conversation' })
  }
})

router.post('/reject', async (req, res) => {
  const { conversationId } = req.body

  const resolved = sessionManager.resolveUserInput(conversationId, { approved: false })

  if (resolved) {
    res.json({ success: true, message: 'Rejection submitted, SSE stream continues' })
  } else {
    res.status(404).json({ error: 'No pending approval for this conversation' })
  }
})
```

**实现要点**:
1. `session-manager.ts` 中维护 `pendingInputResolvers` 映射
2. `stream-processor.ts` 检测到 `requiresApproval` 时调用 `waitForUserInput()` 并 await
3. `/approve` 和 `/reject` 端点调用 `resolveUserInput()` 继续执行
4. SSE 连接断开时调用 `cancelPendingInput()` 清理状态
5. 前端 `chat.store.ts` 设置 `pendingToolApproval` 状态，显示审批 UI

### Decision 8: AskUserQuestion 工具处理

**问题**: AskUserQuestion 工具需要用户回答问题，如何处理？

**选择**: 与工具审批类似的机制，复用 `pendingInputResolvers` 映射

**流程**:
```
1. Agent 调用 AskUserQuestion 工具
2. SSE 流发送 event: ask-question，包含问题列表
3. SSE 流发送 event: waiting-for-input，type: "ask-question"
4. SSE 流暂停（不关闭），等待用户回答
5. 用户填写答案并提交
6. 前端调用 POST /api/v1/agent/answer-question
7. 后端收到答案后，继续 Agent 执行
8. SSE 流继续推送后续事件
```

**新事件格式**:
```typescript
// event: ask-question
{
  "type": "ask-question",
  "id": "question-xxx",
  "questions": [
    {
      "key": "framework",
      "question": "使用哪个前端框架？",
      "header": "Framework",
      "options": [
        { "label": "React", "description": "组件化框架" },
        { "label": "Vue", "description": "渐进式框架" }
      ]
    }
  ]
}

// event: waiting-for-input
{
  "type": "waiting-for-input",
  "inputType": "ask-question",
  "questionId": "question-xxx",
  "message": "等待用户回答问题"
}
```

**HTTP 端点修改**:
```typescript
// agent.routes.ts
router.post('/answer-question', async (req, res) => {
  const { conversationId, id, answers } = req.body

  // 查找并解析等待中的 SSE 流
  const resolved = sessionManager.resolveUserInput(conversationId, { answers })

  if (resolved) {
    res.json({ success: true, message: 'Answers submitted, SSE stream continues' })
  } else {
    res.status(404).json({ error: 'No pending question for this conversation' })
  }
})
```

**实现要点**:
1. 复用 Decision 7 中的 `pendingInputResolvers` 机制
2. 复用现有的 `handleAskQuestion` 和 `answerQuestion` 逻辑
3. 前端 `chat.store.ts` 设置 `pendingQuestion` 状态

### Decision 9: 增量持久化

**问题**: SSE 连接中断时，已生成的部分内容如何保留？

**选择**: 在流式生成过程中实时更新数据库中的 assistant message

**实现**:
```typescript
// stream-processor.ts 中定期更新数据库
const PERSIST_INTERVAL_MS = 2000 // 每 2 秒持久化一次
let lastPersistTime = Date.now()

// 在 text delta 处理中
if (Date.now() - lastPersistTime > PERSIST_INTERVAL_MS) {
  await updateAssistantMessage(conversationId, {
    content: currentStreamingText,
    thoughts: sessionState.thoughts,
    isPartial: true // 标记为部分内容
  })
  lastPersistTime = Date.now()
}
```

**注意事项**:
1. 持久化频率不宜过高，避免数据库压力
2. `isPartial` 标记帮助前端区分部分内容和完整内容
3. 流完成时设置 `isPartial: false`
4. 用户重试时，可看到之前的部分内容

### Decision 10: WebSocket 保留范围

**选择**: WebSocket 服务保留，但仅用于非 Agent 场景

**保留的功能**:
| 功能 | 消息类型 | 说明 |
|------|---------|------|
| 文件变更通知 | `file:change` | 监控文件系统变化 |
| 全局广播 | `broadcastToAll` | 系统级通知 |

**移除的功能**:
| 功能 | 消息类型 | 原因 |
|------|---------|------|
| Agent 事件推送 | `agent:event` | 改用 SSE |
| 对话订阅 | `subscribe`/`unsubscribe` | 不再需要 |

**代码修改**:
```typescript
// websocket.service.ts - 保留
export function sendFileChangeEvent(userId: string, action: string, path: string) { ... }
export function broadcastToAll(event: any) { ... }

// websocket.service.ts - 删除
export function broadcastAgentEvent(eventType: string, data: any) { ... }
// conversationSubscriptions 相关逻辑

// transport.ts - 保留
export function onEvent(channel: string, callback: (data: unknown) => void): () => void { ... }

// transport.ts - 删除
export function subscribeToConversation(conversationId: string): void { ... }
export function unsubscribeFromConversation(conversationId: string): void { ... }
// Agent 事件监听相关代码
```

### Decision 11: Automation App 兼容性

**问题**: `stream-processor.ts` 被 automation app 的 `execute.ts` 复用，但 automation app 不需要 SSE（它是后台任务）。

**选择**: 通过 `ProcessStreamParams` 参数区分 SSE 模式和回调模式

**实现**:
```typescript
// ProcessStreamParams 新增可选参数
interface ProcessStreamParams {
  // ... existing fields

  // SSE 模式（主对话）：提供 sseWriter
  sseWriter?: SseWriter

  // 回调模式（automation app）：提供 onEvent 回调
  onEvent?: (eventName: string, data: any) => void
}

// processStream 内部统一事件发送
function processStream(params: ProcessStreamParams) {
  const { sseWriter, onEvent, spaceId, conversationId, ... } = params

  // 统一的事件发送函数
  const emitEvent = (eventName: string, data: any) => {
    const eventData = { ...data, spaceId, conversationId }

    if (sseWriter) {
      // SSE 模式：写入 SSE 流
      const sseEventName = eventName.replace('agent:', '')
      sseWriter.writeEvent(sseEventName, eventData)
    }

    if (onEvent) {
      // 回调模式：调用回调函数
      onEvent(eventName, eventData)
    }
  }

  // 使用 emitEvent 替代所有 sendToRenderer 调用
  emitEvent('agent:message', { type: 'message', content: '...', isStreaming: true })
}
```

**调用方式**:
```typescript
// 主对话（agent.routes.ts）- SSE 模式
await processStream({
  // ... other params
  sseWriter: createSseWriter(res),
  // onEvent 不提供
})

// Automation app（execute.ts）- 回调模式
await processStream({
  // ... other params
  onEvent: (eventName, data) => {
    // 写入 JSONL 日志或触发 webhook
    sessionStore.appendEvent(runId, { eventName, data })
  },
  // sseWriter 不提供
})
```

**兼容性保证**:
1. `sseWriter` 和 `onEvent` 可以同时提供（用于调试）
2. 都不提供时，事件只写入日志（兼容旧行为）
3. automation app 无需修改调用方式，只需传入 `onEvent` 回调

### Decision 12: 增量持久化数据库支持

**问题**: 增量持久化需要数据库支持 `isPartial` 字段

**选择**: 在 messages 表添加 `is_partial` 字段

**数据库迁移**:
```sql
-- 新增字段
ALTER TABLE messages ADD COLUMN is_partial BOOLEAN DEFAULT FALSE;

-- 索引优化（可选，用于查询未完成的消息）
CREATE INDEX idx_messages_partial ON messages(is_partial) WHERE is_partial = TRUE;
```

**Message 类型更新**:
```typescript
// shared/types.ts
interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  thoughts?: Thought[]
  tokenUsage?: TokenUsage
  isPartial?: boolean  // 新增：标记是否为部分内容
  createdAt: string
  updatedAt: string
}
```

**持久化时机**:
1. **流式生成期间**: 每 2 秒更新一次，`isPartial: true`
2. **流完成时**: 最终更新，`isPartial: false`
3. **流中断时**: 保留当前内容，`isPartial: true`（用户可看到部分内容）

### Decision 13: 错误场景处理

**场景 1: 用户在等待期间发送新消息**

**说明**: 此场景已在 Decision 5 的"新连接替换"机制中处理。当用户发送新消息时：
1. Decision 5 的代码会检查 `activeSSEStreams.get(conversationId)`
2. 如果存在旧连接，会调用 `cancelPendingInput(conversationId)` 清理等待状态
3. 然后创建新的 SSE 流处理新消息

因此，无需额外代码处理此场景。以下伪代码仅用于说明流程：

```
用户发送新消息
    ↓
Decision 5 检查旧连接
    ↓
旧连接存在? → 清理定时器 → abort() → delete() → cancelPendingInput()
    ↓
创建新 SSE 流处理新消息
```

**场景 2: SSE 断开后的等待状态清理**

已在 Decision 5 和 Decision 7 中处理：
- `req.on('close')` 调用 `cancelPendingInput()`
- 等待超时自动清理

**场景 3: 等待超时处理**

已在 Decision 7 中处理：
- `pendingInputResolvers` 设置 5 分钟超时
- 超时后 reject Promise，Agent 收到错误

### Decision 14: 多进程部署限制

**问题**: `activeSSEStreams` 和 `pendingInputResolvers` 是进程内内存，多进程部署时无法共享。

**当前选择**: 仅支持单进程部署

**理由**:
1. Halo 是桌面应用，单进程部署满足需求
2. 多进程需要引入 Redis 等外部存储，增加复杂度

**未来扩展**（如需多进程）:
```typescript
// 使用 Redis 存储等待状态
const redisClient = createRedisClient()

export async function waitForUserInput(conversationId: string, ...): Promise<any> {
  // 将等待状态存入 Redis
  await redisClient.hset(`pending:${conversationId}`, 'inputType', inputType)

  // 轮询 Redis 等待结果
  while (true) {
    const result = await redisClient.hget(`pending:${conversationId}`, 'result')
    if (result) {
      await redisClient.del(`pending:${conversationId}`)
      return JSON.parse(result)
    }
    await sleep(100)
  }
}
```

## Architecture

### SSE 消息流架构

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端                                   │
│  ┌─────────────────┐                                            │
│  │  chat.store.ts  │                                            │
│  │  sendMessage()  │                                            │
│  └────────┬────────┘                                            │
│           │ fetch POST + ReadableStream                         │
│           ▼                                                      │
└───────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────┐
│                           后端                                    │
│  ┌─────────────────┐     ┌─────────────────┐                     │
│  │ agent.routes.ts │────▶│ stream-processor│                     │
│  │                 │     │                 │                     │
│  │ res.setHeader() │     │ sseWriter.write │                     │
│  │ res.write()     │◀────│ Event()        │                     │
│  └─────────────────┘     └────────┬────────┘                     │
│                                   │                               │
│                                   ▼                               │
│                          ┌─────────────────┐                     │
│                          │ Claude Agent SDK│                     │
│                          │ v2Session.stream│                     │
│                          └─────────────────┘                     │
└───────────────────────────────────────────────────────────────────┘
```

### 双向通信场景架构（工具审批/AskUserQuestion）

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端                                   │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  SSE Stream     │     │ HTTP POST       │                    │
│  │  (消费事件)     │     │ (提交操作)      │                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           │                       │                              │
│           │ 1. waiting-for-input │ 2. POST /approve             │
│           │    event received    │    or /answer-question        │
│           ▼                       ▼                              │
└───────────────────────────────────────────────────────────────────┘
            │                           │
            ▼                           ▼
┌───────────────────────────────────────────────────────────────────┐
│                           后端                                    │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                 SSE Connection (保持打开)                  │     │
│  │                                                          │     │
│  │  3. 收到 HTTP POST 后继续 Agent 执行                      │     │
│  │  4. 后续事件继续通过 SSE 流推送                           │     │
│  └─────────────────────────────────────────────────────────┘     │
└───────────────────────────────────────────────────────────────────┘
```

### WebSocket 保留功能架构

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端                                   │
│  ┌─────────────────┐                                            │
│  │  transport.ts   │                                            │
│  │  onEvent()      │◀──── WebSocket 连接（保留）                │
│  └─────────────────┘                                            │
│           │                                                      │
│           │ 仅用于：file:change、broadcastToAll                  │
│           ▼                                                      │
└───────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────────────┐
│                           后端                                    │
│  ┌─────────────────┐                                            │
│  │ websocket.      │                                            │
│  │ service.ts      │                                            │
│  │ (保留)          │                                            │
│  └─────────────────┘                                            │
│                                                                  │
│  保留功能：                                                       │
│  - sendFileChangeEvent()                                         │
│  - broadcastToAll()                                              │
│                                                                  │
│  移除功能：                                                       │
│  - broadcastAgentEvent() ❌                                       │
│  - conversationSubscriptions ❌                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

### Risk 1: 连接中断导致状态不一致
- **风险**: SSE 连接中断后，AI 可能仍在处理，但前端无法接收结果
- **缓解**:
  - 后端检测连接断开时通过 AbortController 取消 Agent 执行
  - 前端显示"连接中断"提示，用户可重试

### Risk 2: 认证 Token 过期
- **风险**: 长时间 SSE 连接期间 token 过期
- **缓解**: SSE 连接在请求时验证 token，不进行中间刷新。超长任务应考虑分片

### Risk 3: 浏览器并发连接限制
- **风险**: 浏览器对同域名有并发连接限制（通常 6 个）
- **缓解**: 对话场景下用户通常只有 1-2 个活跃连接，影响较小

### Risk 4: activeSSEStreams 内存泄漏
- **风险**: 异常情况下（如进程崩溃、未触发的 `req.on('close')`），`activeSSEStreams` Map 可能残留条目
- **缓解**:
  - 在流结束时（complete、error）主动清理映射
  - 新连接启动时，清理该 conversationId 的旧连接
  - 添加超时检查：如果连接超过 30 分钟，自动清理

## Migration Plan

### Phase 1: 实现 SSE 流式响应
1. 创建 `src/server/utils/sse-writer.ts` 工具类
2. 修改 `stream-processor.ts`，使用 SSE Writer 替代 `sendToRenderer`
3. 修改 `agent.routes.ts` 返回 SSE 流
4. 实现 `activeSSEStreams` 映射管理

### Phase 2: 前端适配
1. 创建 `src/web/api/sse.ts` SSE 消费工具
2. 修改 `chat.store.ts` 使用 fetch + ReadableStream

### Phase 3: 清理
1. 删除 `src/server/services/agent/helpers.ts` 中的 `sendToRenderer` 函数（保留 `broadcastToAllClients`）
2. 删除 `src/server/services/websocket.service.ts` 中的 Agent 相关代码：
   - 删除 `broadcastAgentEvent` 函数
   - 删除 `conversationSubscriptions` Map
   - 删除 `subscribeUserToConversation` 函数
   - 删除 `unsubscribeUserFromConversation` 函数
   - 保留 `sendFileChangeEvent` 和 `broadcastToAll` 函数
3. 删除 `src/web/api/transport.ts` 中 Agent 相关代码：
   - 删除 `subscribeToConversation` 函数
   - 删除 `unsubscribeFromConversation` 函数
   - 保留 WebSocket 连接和 `onEvent` 函数（用于非 Agent 事件）
4. 添加单元测试和 E2E 测试
