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
5. 采用 SSE + WebSocket 双通道架构：
   - SSE 负责对话特定事件
   - WebSocket 负责全局事件（MCP 状态、文件变更等）
6. 过渡期间 Agent 事件同时发送到两个通道，确保兼容性

**Non-Goals:**
1. 完全移除 WebSocket（保留用于全局事件）
2. 对话列表功能（独立 change）
3. 多设备实时同步（未来需求）

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

**选择**: SSE + WebSocket 并存模式，`emitEvent()` 同时发送到两个通道

**核心理念**:
1. **渐进式迁移**: 过渡期间，Agent 事件同时发送到 SSE 和 WebSocket，确保兼容性
2. **职责分离**: SSE 负责对话特定事件，WebSocket 负责全局事件
3. **平滑过渡**: 前端可以逐步切换到 SSE，无需一次性全部改动

**架构分层**:

| 事件类型 | 传输方式 | 处理函数 | 说明 |
|---------|---------|---------|------|
| Agent 对话事件 | SSE + WebSocket | `emitEvent()` | 同时发送到两个通道（过渡期） |
| 全局事件（MCP 状态） | 仅 WebSocket | `broadcastToAllClients()` | 广播给所有客户端 |
| 文件变更通知 | 仅 WebSocket | `sendFileChangeEvent()` | 文件系统监控 |

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
  const { sseWriter, onEvent, spaceId, conversationId, sendToRenderer, ... } = params

  // 统一的事件发送函数（同时发送到 SSE 和 WebSocket）
  const emitEvent = (eventName: string, data: any) => {
    const eventData = { ...data, spaceId, conversationId }

    // 1. 继续发送到 WebSocket（保持兼容性，过渡期）
    sendToRenderer(eventName, spaceId, conversationId, eventData)

    // 2. 如果有 sseWriter，也发送到 SSE
    if (sseWriter) {
      const sseEventName = eventName.replace('agent:', '')
      sseWriter.writeEvent(sseEventName, eventData)
    }

    // 3. 如果有 onEvent 回调，也调用回调（automation app）
    if (onEvent) {
      onEvent(eventName, eventData)
    }
  }

  // 使用 emitEvent 替代所有 sendToRenderer 调用
  emitEvent('agent:message', { type: 'message', content: '...', isStreaming: true })
}
```

**全局事件特殊处理**:

`stream-processor.ts` 中有 `broadcastMcpStatus()` 调用，这是全局事件，仅通过 WebSocket 广播：

```typescript
// stream-processor.ts 中保持不变
broadcastMcpStatus(mcpServers)  // 仅 WebSocket，不发送到 SSE
```

**sendToRenderer 调用点分类**:

`stream-processor.ts` 中的 `sendToRenderer` 调用，按事件类型分类：

| 事件名称 | 调用次数 | 改造方式 |
|---------|---------|---------|
| `agent:message` | 4 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:thought` | 4 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:thought-delta` | 5 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:tool-call` | 2 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:tool-result` | 2 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:error` | 2 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:compact` | 1 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:complete` | 1 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:ask-question` | 1 | 改用 `emitEvent()`（SSE + WebSocket） |
| `agent:waiting-for-input` | 1 | 改用 `emitEvent()`（SSE + WebSocket） |
| `broadcastMcpStatus` | 1 | 保持不变（仅 WebSocket） |

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

> **注意**: `activeSSEStreams` 的详细生命周期管理见 Decision 14（SSE 连接与 V2 Session 生命周期协调）。
> 本节描述 agent.routes.ts 中的简化用法，Decision 14 描述 session-manager.ts 中的统一管理。

**责任边界设计**:
- **`req.on('close')` 回调**: 只负责 `abort()`，不负责删除映射
- **`finally` 块**: 只负责删除映射和清理等待状态，不重复 abort（abort 是幂等的，重复调用无害）
- **超时定时器**: 在创建 SSE 流时启动，在 `finally` 块中清理

**agent.routes.ts 简化实现**（生命周期协调移到 session-manager.ts）:
```typescript
import {
  registerSSEStream,
  unregisterSSEStream,
  cancelPendingInput
} from '../services/agent/session-manager'

// POST /api/v1/agent/message 处理
router.post('/message', async (req, res) => {
  const { conversationId } = req.body
  const abortController = new AbortController()

  // 1. 注册 SSE 连接（包含超时定时器设置和 V2 Session 同步）
  registerSSEStream(conversationId, sseWriter, abortController)

  try {
    // 2. 设置 SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // 3. 监听连接断开 - 只负责 abort，不负责删除
    req.on('close', () => {
      abortController.abort()
      cancelPendingInput(conversationId)
    })

    // 4. 创建 SSE Writer 并执行 Agent
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
    // 5. 注销 SSE 连接（清理超时定时器和同步 V2 Session 状态）
    unregisterSSEStream(conversationId)
  }
})

// POST /api/v1/agent/stop 调用
router.post('/stop', async (req, res) => {
  const { conversationId } = req.body
  const entry = activeSSEStreams.get(conversationId)
  if (entry) {
    entry.abortController.abort()
    cancelPendingInput(conversationId)
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

> **重要说明**：工具审批是**新功能开发**，而非功能迁移。
> 当前代码使用 `permissionMode: 'bypassPermissions'` 跳过所有权限检查，
> `approveTool` 和 `rejectTool` 函数是空实现（TODO）。

**问题**: SSE 是单向通信，如何处理需要用户审批的工具调用？

**选择**: 修改 SDK 权限模式，在 `createCanUseTool` 回调中实现工具审批逻辑

**现状分析**:

当前 `permission-handler.ts` 的实现：
```typescript
// 当前代码：只处理 AskUserQuestion，其他工具全部 auto-allow
export function createCanUseTool(deps?: CanUseToolDeps): CanUseToolFn {
  return async (toolName, input, options) => {
    // Non-AskUserQuestion tools: auto-allow
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'allow', updatedInput: input }
    }
    // AskUserQuestion: 暂停等待用户回答...
  }
}
```

当前 `index.ts` 的空实现：
```typescript
export async function approveTool(conversationId: string, toolId?: string): Promise<void> {
  // TODO: Implement tool approval logic
  console.log(`[Agent] Tool approved: ${conversationId}, ${toolId}`)
}
```

**改造方案**:

1. **修改 SDK 权限模式**（`sdk-config.ts`）：
```typescript
// 从 bypassPermissions 改为 default（启用权限检查）
permissionMode: 'default' as const,  // 不再是 'bypassPermissions'
```

2. **扩展 `createCanUseTool` 回调**（`permission-handler.ts`）：
```typescript
// 需要审批的工具列表
const TOOLS_REQUIRING_APPROVAL = ['Bash', 'Edit', 'Write', 'NotebookEdit']

export function createCanUseTool(deps?: CanUseToolDeps): CanUseToolFn {
  return async (toolName, input, options) => {
    // AskUserQuestion: 保持现有逻辑
    if (toolName === 'AskUserQuestion') {
      return handleAskQuestion(deps, input, options)
    }

    // 工具审批：检查是否需要审批
    if (TOOLS_REQUIRING_APPROVAL.includes(toolName)) {
      return handleToolApproval(deps, toolName, input, options)
    }

    // 其他工具：auto-allow
    return { behavior: 'allow', updatedInput: input }
  }
}

// 工具审批处理函数
async function handleToolApproval(
  deps: CanUseToolDeps | undefined,
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
): Promise<PermissionResult> {
  if (!deps) {
    return { behavior: 'allow', updatedInput: input }
  }

  const { sendToRenderer, spaceId, conversationId } = deps
  const toolCallId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  // 1. 发送 tool-call 事件（包含 requiresApproval 标志）
  sendToRenderer('agent:tool-call', spaceId, conversationId, {
    id: toolCallId,
    name: toolName,
    input,
    status: 'pending',
    requiresApproval: true
  })

  // 2. 发送 waiting-for-input 事件
  sendToRenderer('agent:waiting-for-input', spaceId, conversationId, {
    inputType: 'tool-approval',
    toolCallId,
    toolName,
    message: `等待审批工具调用: ${toolName}`
  })

  // 3. 等待用户审批（通过 pendingInputResolvers）
  try {
    const result = await waitForUserInput(
      conversationId,
      'tool-approval',
      { toolCallId },
      options.signal
    )

    if (result.approved) {
      return { behavior: 'allow', updatedInput: input }
    } else {
      return { behavior: 'deny', updatedInput: input }
    }
  } catch (error) {
    // 超时或取消
    return { behavior: 'deny', updatedInput: input }
  }
}
```

3. **整合 `pendingInputResolvers` 机制**（`session-manager.ts`）：

现有的 `pendingQuestions` Map（在 `permission-handler.ts` 中）处理 AskUserQuestion，
新增 `pendingInputResolvers` Map（在 `session-manager.ts` 中）处理工具审批。

```typescript
// session-manager.ts 中新增
const pendingInputResolvers = new Map<string, {
  resolve: (value: { approved?: boolean; answers?: Record<string, string> }) => void
  reject: (reason: any) => void
  inputType: 'tool-approval' | 'ask-question'
  createdAt: number
  timeoutId?: NodeJS.Timeout
}>()

// 等待用户输入（支持超时和取消）
export async function waitForUserInput(
  conversationId: string,
  inputType: 'tool-approval' | 'ask-question',
  metadata: { toolCallId?: string; questionId?: string },
  signal?: AbortSignal,
  timeoutMs: number = 5 * 60 * 1000
): Promise<{ approved?: boolean; answers?: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    // 设置超时
    const timeoutId = setTimeout(() => {
      pendingInputResolvers.delete(conversationId)
      reject(new Error('User input timeout'))
    }, timeoutMs)

    // 存储解析器
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

    // 监听 abort 信号
    if (signal) {
      const onAbort = () => {
        const entry = pendingInputResolvers.get(conversationId)
        if (entry) {
          entry.reject(new Error('Aborted'))
        }
      }
      if (signal.aborted) {
        onAbort()
      } else {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    }
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

// SSE 连接断开或 stop 时清理
export function cancelPendingInput(conversationId: string) {
  const pending = pendingInputResolvers.get(conversationId)
  if (pending) {
    pending.reject(new Error('SSE connection closed'))
    pendingInputResolvers.delete(conversationId)
  }
}
```

4. **实现 HTTP 端点**（`agent.routes.ts`）：
```typescript
// 批准工具调用
router.post('/approve', async (req, res) => {
  const { conversationId, toolId } = req.body
  const resolved = resolveUserInput(conversationId, { approved: true })
  if (resolved) {
    res.json({ success: true, message: 'Tool approved, SSE stream continues' })
  } else {
    res.status(404).json({ error: 'No pending approval for this conversation' })
  }
})

// 拒绝工具调用
router.post('/reject', async (req, res) => {
  const { conversationId, toolId } = req.body
  const resolved = resolveUserInput(conversationId, { approved: false })
  if (resolved) {
    res.json({ success: true, message: 'Tool rejected, SSE stream continues' })
  } else {
    res.status(404).json({ error: 'No pending approval for this conversation' })
  }
})
```

**流程**:
```
1. SDK 调用需要审批的工具（如 Bash）
2. SDK 通过 canUseTool 回调询问权限
3. createCanUseTool 发送 tool-call 事件（requiresApproval: true）
4. createCanUseTool 发送 waiting-for-input 事件
5. createCanUseTool 调用 waitForUserInput() 等待
6. 用户点击"批准"或"拒绝"
7. 前端调用 POST /api/v1/agent/approve 或 /reject
8. HTTP 端点调用 resolveUserInput()
9. waitForUserInput() Promise 解析
10. canUseTool 返回 { behavior: 'allow' | 'deny' }
11. SDK 继续或取消工具执行
12. SSE 流继续推送后续事件
```

**新事件格式**:
```typescript
// event: tool-call（需要审批时）
{
  "type": "agent:tool-call",
  "spaceId": "space-xxx",
  "conversationId": "conv-xxx",
  "id": "tool-xxx",
  "name": "Bash",
  "input": { "command": "rm -rf /" },
  "status": "pending",
  "requiresApproval": true
}

// event: waiting-for-input
{
  "type": "agent:waiting-for-input",
  "spaceId": "space-xxx",
  "conversationId": "conv-xxx",
  "inputType": "tool-approval",
  "toolCallId": "tool-xxx",
  "toolName": "Bash",
  "message": "等待审批工具调用: Bash"
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

**现状分析**:
- `AskUserQuestion` 是 `@anthropic-ai/claude-agent-sdk` 的**内置工具**
- `permission-handler.ts` 已有完整实现：
  - `pendingQuestions` Map 管理等待回答的问题
  - `resolveQuestion()` 函数供 HTTP 端点调用
  - `rejectQuestion()` 函数处理取消场景
- `agent.routes.ts` 已有 `/answer-question` 端点

**选择**: 保留现有实现，修改为使用 `emitEvent` 支持 SSE 双通道

**需要的修改**:
```typescript
// permission-handler.ts - 修改 CanUseToolDeps 接口
interface CanUseToolDeps {
  emitEvent: (eventName: string, data: any) => void  // 改用 emitEvent
  spaceId: string
  conversationId: string
}

// permission-handler.ts - 修改发送逻辑
export function createCanUseTool(deps?: CanUseToolDeps): CanUseToolFn {
  return async (toolName, input, options) => {
    if (toolName !== 'AskUserQuestion') {
      return { behavior: 'allow', updatedInput: input }
    }

    // ... 创建 answersPromise ...

    // 修改：使用 emitEvent 发送事件（支持 SSE + WebSocket 双通道）
    // 1. 发送 ask-question 事件
    emitEvent('agent:ask-question', {
      id,
      questions: questions || []
    })

    // 2. 发送 waiting-for-input 事件
    emitEvent('agent:waiting-for-input', {
      type: 'question',
      questionId: id
    })

    // 3. 等待用户回答
    const answers = await answersPromise
    return { behavior: 'allow', updatedInput: { ...input, answers } }
  }
}
```

**流程**:
```
1. Agent 调用 AskUserQuestion 工具（SDK 内置）
2. permission-handler.ts 拦截，创建 pendingQuestions 条目
3. 发送 agent:ask-question 事件（SSE + WebSocket 双通道）
4. 发送 agent:waiting-for-input 事件（SSE + WebSocket 双通道）
5. SSE 流暂停（Promise await），等待用户回答
6. 用户填写答案并提交
7. 前端调用 POST /api/v1/agent/answer-question
8. 后端调用 resolveQuestion() 解析 Promise
9. Agent 继续执行
10. SSE 流继续推送后续事件
```

**事件格式**:
```typescript
// event: ask-question
{
  "type": "ask-question",
  "id": "ask-xxx",
  "questions": [
    {
      "question": "使用哪个前端框架？",
      "header": "Framework",
      "options": [
        { "label": "React", "description": "组件化框架" },
        { "label": "Vue", "description": "渐进式框架" }
      ],
      "multiSelect": false
    }
  ]
}

// event: waiting-for-input
{
  "type": "waiting-for-input",
  "inputType": "question",
  "questionId": "ask-xxx",
  "message": "等待用户回答问题"
}
```

**HTTP 端点保持不变**:
```typescript
// agent.routes.ts - 现有实现无需修改
router.post('/answer-question', async (req, res) => {
  const { conversationId, id, answers } = req.body
  await agentService.answerQuestion(conversationId, id, answers)
  // resolveQuestion() 在 agentService.answerQuestion() 内部调用
})
```

**实现要点**:
1. 修改 `CanUseToolDeps` 接口，用 `emitEvent` 替代 `sendToRenderer`
2. 在发送 `agent:ask-question` 后立即发送 `agent:waiting-for-input`
3. 保留现有 `pendingQuestions` Map 机制
4. `emitEvent` 从 `stream-processor.ts` 传入 `createCanUseTool()`

### Decision 9: 增量持久化

**问题**: SSE 连接中断时，已生成的部分内容如何保留？

**选择**: 在流式生成过程中，通过事件驱动触发增量持久化（非定时器）

**核心理念**:
1. **不使用定时器**: 避免定时器与 `for await...of` 流循环的协调问题
2. **事件驱动触发**: 在有意义的内容节点持久化，而非盲目按时间
3. **错误隔离**: 增量持久化失败不中断主流程，只记录警告
4. **与 onComplete 协调**: 最后一次增量持久化后，再调用 onComplete 做最终处理

**架构设计**:

```typescript
// 1. 在 StreamCallbacks 中添加增量持久化回调
export interface StreamCallbacks {
  onComplete(result: StreamResult): void
  onRawMessage?(sdkMessage: any): void
  onIncrementalPersist?(finalContent: string, thoughts: Thought[]): void  // 新增
}

// 2. 在 stream-processor.ts 内部实现
function processStream(params: ProcessStreamParams) {
  const { callbacks, ... } = params

  // 状态
  let lastPersistTime = 0
  const MIN_PERSIST_INTERVAL_MS = 1000  // 最少间隔 1 秒，避免高频写入

  // 增量持久化辅助函数
  function tryIncrementalPersist() {
    const now = Date.now()
    if (now - lastPersistTime < MIN_PERSIST_INTERVAL_MS) return

    try {
      if (callbacks.onIncrementalPersist) {
        callbacks.onIncrementalPersist(finalContent, [...sessionState.thoughts])
        lastPersistTime = now
      }
    } catch (error) {
      console.warn('[Agent] Incremental persist failed, will retry later:', error)
      // 不抛出错误，继续流处理
    }
  }

  // 判断是否为好的持久化时机
  function shouldTryPersist(sdkMessage: any): boolean {
    // text 块结束（用户可见内容增加）
    if (sdkMessage.type === 'content_block_stop' && currentBlockType === 'text') {
      return true
    }
    // tool_result 完成
    if (sdkMessage.type === 'tool_result') {
      return true
    }
    // thinking 累积超过阈值
    if (currentThinkingLength > 500) {
      return true
    }
    return false
  }

  // 流处理循环
  try {
    for await (const sdkMessage of queryIterator) {
      // 处理消息...

      // 在关键节点尝试增量持久化
      if (shouldTryPersist(sdkMessage)) {
        tryIncrementalPersist()
      }
    }
  } finally {
    // 流结束时，最后一次增量持久化
    try {
      if (callbacks.onIncrementalPersist) {
        callbacks.onIncrementalPersist(finalContent, [...sessionState.thoughts])
      }
    } catch (error) {
      console.warn('[Agent] Final incremental persist failed:', error)
    }

    // 然后调用 onComplete 进行最终持久化
    callbacks.onComplete(result)
  }
}

// 3. 在 send-message.ts 中实现回调
await processStream({
  callbacks: {
    onComplete: (streamResult) => {
      // 最终持久化（isPartial: false）
      const { finalContent, thoughts, tokenUsage, hasErrorThought, errorThought } = streamResult
      if (finalContent || hasErrorThought) {
        updateAssistantMessage(conversationId, {
          content: finalContent,
          thoughts: thoughts.length > 0 ? [...thoughts] : undefined,
          tokenUsage: tokenUsage || undefined,
          error: errorThought?.content,
          isPartial: false  // 最终持久化标记为完整
        })
      }
    },
    onIncrementalPersist: (finalContent, thoughts) => {
      // 增量持久化（isPartial: true）
      updateAssistantMessage(conversationId, {
        content: finalContent,
        thoughts: [...thoughts],
        isPartial: true  // 标记为部分内容
      })
    }
  }
})
```

**持久化触发点**:

| 触发点 | 说明 | 优先级 |
|--------|------|--------|
| 完整 text 块后 | 用户可见内容增加 | 高 |
| tool_result 后 | 工具执行结果 | 中 |
| thinking 块累积超过 500 字符 | 思考过程记录 | 低 |
| 流结束前（finally） | 确保最后一次状态 | 必须 |

**注意事项**:
1. 增量持久化失败不中断流，只记录警告
2. 频率限制：最少间隔 1 秒，避免高频 text 块导致过多数据库写入
3. `isPartial` 标记帮助前端区分部分内容和完整内容
4. 流完成时调用 onComplete 设置 `isPartial: false`
5. 用户重试时，可看到之前的部分内容

### Decision 10: SSE + WebSocket 双通道架构

**选择**: WebSocket 服务保留，与 SSE 并存

**架构设计**:
- **SSE 通道**: 对话特定事件（每个连接独立）
- **WebSocket 通道**: 全局事件 + Agent 事件（过渡期双通道）

**通道分配**:

| 事件类型 | SSE 通道 | WebSocket 通道 | 说明 |
|---------|---------|----------------|------|
| `agent:message` | ✓ | ✓ | 对话事件，双通道 |
| `agent:thought` | ✓ | ✓ | 对话事件，双通道 |
| `agent:tool-call` | ✓ | ✓ | 对话事件，双通道 |
| `agent:complete` | ✓ | ✓ | 对话事件，双通道 |
| `agent:error` | ✓ | ✓ | 对话事件，双通道 |
| `mcp:status` | ✗ | ✓ | 全局事件，仅 WebSocket |
| `file:change` | ✗ | ✓ | 全局事件，仅 WebSocket |
| `broadcastToAll` | ✗ | ✓ | 全局事件，仅 WebSocket |

**保留的功能**:
| 功能 | 消息类型 | 说明 |
|------|---------|------|
| 文件变更通知 | `file:change` | 监控文件系统变化 |
| 全局广播 | `broadcastToAll` | 系统级通知 |
| MCP 状态广播 | `mcp:status` | MCP 服务器状态变更 |
| Agent 事件推送 | `agent:*` | 过渡期双通道 |

**移除的功能**:
| 功能 | 消息类型 | 原因 |
|------|---------|------|
| 对话订阅 | `subscribe`/`unsubscribe` | SSE 无需订阅 |

**代码修改**:
```typescript
// websocket.service.ts - 保留
export function sendFileChangeEvent(userId: string, action: string, path: string) { ... }
export function broadcastToAll(event: any) { ... }
export function broadcastAgentEvent(eventType: string, data: any) { ... }  // 保留（双通道需要）

// websocket.service.ts - 删除
// conversationSubscriptions 相关逻辑

// transport.ts - 保留
export function onEvent(channel: string, callback: (data: unknown) => void): () => void { ... }

// transport.ts - 删除
export function subscribeToConversation(conversationId: string): void { ... }
export function unsubscribeFromConversation(conversationId: string): void { ... }
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
  const { sseWriter, onEvent, spaceId, conversationId, sendToRenderer, ... } = params

  // 统一的事件发送函数（双通道 + 回调）
  const emitEvent = (eventName: string, data: any) => {
    const eventData = { ...data, spaceId, conversationId }

    // 1. 发送到 WebSocket（双通道架构）
    sendToRenderer(eventName, spaceId, conversationId, eventData)

    // 2. 发送到 SSE（如果提供）
    if (sseWriter) {
      const sseEventName = eventName.replace('agent:', '')
      sseWriter.writeEvent(sseEventName, eventData)
    }

    // 3. 调用回调（automation app）
    if (onEvent) {
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

**选择**: 将 `isPartial` 作为 JSON 对象的属性存储在每条消息内部

**理由**:
1. 当前消息以 JSON 数组形式存储在 `conversations` 表的 `messages` 字段中
2. 无需数据库架构重构，只需更新数据操作逻辑
3. 与现有存储模式一致，改动最小

**Message 类型更新**:
```typescript
// shared/types.ts - Message 接口新增字段
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

// 数据库存储示例（conversations.messages JSON 数组中的 assistant message）
{
  "id": "msg-xxx",
  "role": "assistant",
  "content": "已生成的部分文本...",
  "thoughts": [...],
  "isPartial": true,  // 存储在 JSON 对象内部
  "timestamp": 1709123456789
}
```

**数据操作修改**:
```typescript
// send-message.ts 中的 updateAssistantMessage 函数
function updateAssistantMessage(conversationId: string, update: {
  content?: string
  thoughts?: any[]
  tokenUsage?: any
  error?: string
  isPartial?: boolean  // 新增参数
}) {
  try {
    const db = getDatabase()
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any
    if (!conversation) return

    const messages = JSON.parse(conversation.messages || '[]')
    const lastMessage = messages[messages.length - 1]
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content = update.content || ''
      if (update.thoughts) lastMessage.thoughts = update.thoughts
      if (update.tokenUsage) lastMessage.tokenUsage = update.tokenUsage
      if (update.error) lastMessage.error = update.error
      if (update.isPartial !== undefined) lastMessage.isPartial = update.isPartial  // 更新 isPartial
      lastMessage.timestamp = Date.now()
    }

    db.prepare('UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(messages), Date.now(), conversationId)
  } catch (error) {
    console.error('[Agent] Failed to update assistant message:', error)
  }
}
```

**持久化时机**:
1. **流式生成期间**: 每 2 秒更新一次，`isPartial: true`
2. **流完成时**: 最终更新，`isPartial: false`
3. **流中断时**: 保留当前内容，`isPartial: true`（用户可看到部分内容）

**注意事项**:
- 无需数据库迁移脚本
- 前端读取对话历史时，需检查 `isPartial` 字段并显示相应提示
- 旧消息默认 `isPartial: false`（字段不存在时视为完整消息）

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

### Decision 14: SSE 连接与 V2 Session 生命周期协调

**问题**: SSE 连接超时与 V2 SDK Session 超时需要协调，两者都使用 30 分钟超时，但 Proposal 没有说明如何同步。

**现状分析**:

`session-manager.ts` 已有：
- `v2Sessions` Map - V2 SDK 会话
- `activeSessions` Map - 请求中的会话状态
- `SESSION_TIMEOUT_MS = 30 * 60 * 1000` - 30 分钟超时
- `cleanupStaleSessions()` - 每 5 分钟清理一次

Proposal 新增：
- `activeSSEStreams` Map - SSE 连接（在 agent.routes.ts 中）
- `pendingInputResolvers` Map - 等待输入状态

**选择**: 扩展现有 `session-manager.ts`，统一管理生命周期

**理由**:
1. SSE 连接与 Session 生命周期紧密绑定
2. 共享 AbortController 更直接
3. 避免多个文件间的同步问题

**设计方案**:

```typescript
// types.ts - 扩展 SessionState 和 V2SessionInfo
export interface SessionState {
  abortController: AbortController
  spaceId: string
  conversationId: string
  thoughts: Thought[]
  isGenerating: boolean
  sseConnectedAt?: number      // 新增：SSE 连接建立时间
  lastActivityAt?: number      // 新增：最后活动时间
}

export interface V2SessionInfo {
  session: V2SDKSession
  spaceId: string
  conversationId: string
  createdAt: number
  lastUsedAt: number
  config: SessionConfig
  credentialsGeneration: number
  isSSEActive?: boolean        // 新增：是否有活跃的 SSE 连接
}

// session-manager.ts - 新增 SSE 连接管理
/** SSE 连接信息 */
interface SSEStreamEntry {
  conversationId: string
  sseWriter: SseWriter
  createdAt: number
  lastActivityAt: number
  abortController: AbortController
  timeoutId: NodeJS.Timeout
}

/** SSE 连接映射（从 agent.routes.ts 移入） */
export const activeSSEStreams = new Map<string, SSEStreamEntry>()

const SSE_TIMEOUT_MS = 30 * 60 * 1000  // 与 SESSION_TIMEOUT_MS 一致

/**
 * 注册 SSE 连接
 */
export function registerSSEStream(
  conversationId: string,
  sseWriter: SseWriter,
  abortController: AbortController
): void {
  const now = Date.now()
  const timeoutId = setTimeout(() => {
    console.log(`[Agent] SSE timeout: ${conversationId}`)
    abortController.abort()
    cancelPendingInput(conversationId)
  }, SSE_TIMEOUT_MS)

  activeSSEStreams.set(conversationId, {
    conversationId,
    sseWriter,
    createdAt: now,
    lastActivityAt: now,
    abortController,
    timeoutId
  })

  // 同步更新 V2 Session 信息
  const sessionInfo = v2Sessions.get(conversationId)
  if (sessionInfo) {
    sessionInfo.isSSEActive = true
  }

  // 同步更新 activeSessions
  const sessionState = activeSessions.get(conversationId)
  if (sessionState) {
    sessionState.sseConnectedAt = now
    sessionState.lastActivityAt = now
  }

  console.log(`[Agent][${conversationId}] SSE stream registered`)
}

/**
 * 注销 SSE 连接
 */
export function unregisterSSEStream(conversationId: string): void {
  const entry = activeSSEStreams.get(conversationId)
  if (entry) {
    clearTimeout(entry.timeoutId)
    // 注意：不调用 abortController.abort()，由调用方决定
    activeSSEStreams.delete(conversationId)
  }

  // 同步更新 V2 Session 信息
  const sessionInfo = v2Sessions.get(conversationId)
  if (sessionInfo) {
    sessionInfo.isSSEActive = false
  }

  console.log(`[Agent][${conversationId}] SSE stream unregistered`)
}

/**
 * 统一清理超时资源（替换原来的 cleanupStaleSessions）
 */
export function cleanupStaleResources(): void {
  const now = Date.now()
  let sseCleaned = 0
  let sessionCleaned = 0

  // 1. 清理超时的 SSE 连接
  for (const [conversationId, entry] of activeSSEStreams) {
    // 如果正在生成中，跳过
    const sessionState = activeSessions.get(conversationId)
    if (sessionState?.isGenerating) {
      continue
    }

    // 检查超时
    if (now - entry.lastActivityAt > SSE_TIMEOUT_MS) {
      try {
        entry.abortController.abort()
      } catch (e) {
        // ignore
      }
      clearTimeout(entry.timeoutId)
      activeSSEStreams.delete(conversationId)

      // 同步更新 V2 Session
      const sessionInfo = v2Sessions.get(conversationId)
      if (sessionInfo) {
        sessionInfo.isSSEActive = false
      }

      sseCleaned++
      console.log(`[Agent][${conversationId}] SSE stream timed out and cleaned`)
    }
  }

  // 2. 清理超时的 V2 Session
  for (const [conversationId, info] of v2Sessions) {
    // 跳过有活跃 SSE 连接或正在生成的会话
    if (info.isSSEActive || activeSessions.has(conversationId)) {
      continue
    }

    if (now - info.lastUsedAt > SESSION_TIMEOUT_MS) {
      try {
        info.session.close()
      } catch (error) {
        console.error(`[Agent][${conversationId}] Error closing stale session:`, error)
      }
      v2Sessions.delete(conversationId)
      sessionCleaned++
    }
  }

  if (sseCleaned > 0 || sessionCleaned > 0) {
    console.log(`[Agent] Cleaned up: ${sseCleaned} SSE streams, ${sessionCleaned} sessions`)
  }
}

// 替换原来的 setInterval
setInterval(cleanupStaleResources, 5 * 60 * 1000)  // 每 5 分钟
```

**agent.routes.ts 简化**:

```typescript
// SSE 连接管理移到 session-manager.ts
import {
  registerSSEStream,
  unregisterSSEStream,
  cancelPendingInput
} from '../services/agent/session-manager'

router.post('/message', async (req, res) => {
  const abortController = new AbortController()

  // 注册 SSE 连接（包含超时定时器设置）
  registerSSEStream(conversationId, sseWriter, abortController)

  try {
    // ... 流处理 ...
  } finally {
    // 注销 SSE 连接（清理超时定时器）
    unregisterSSEStream(conversationId)
  }
})
```

**生命周期协调图**:

```
┌─────────────────────────────────────────────────────────────┐
│                    统一的生命周期管理                         │
│                    (session-manager.ts)                      │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
     ┌────────▼─────────┐          ┌────────▼─────────┐
     │  V2 SDK Session  │          │   SSE 连接       │
     │  (v2Sessions)    │          │ (activeSSEStreams)│
     │                  │          │                   │
     │  isSSEActive ────┼──────────┼─▶ 同步状态        │
     └────────┬─────────┘          └────────┬─────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  共享的清理机制    │
                    │  cleanupStaleResources()
                    │  (每 5 分钟运行)   │
                    └───────────────────┘
```

**关键设计原则**:

| 原则 | 说明 |
|-----|------|
| 超时时间统一 | SSE 连接和 V2 Session 都使用 30 分钟超时 |
| 活跃状态优先 | 如果有 `isGenerating` 或 `isSSEActive`，不清理 |
| 双向同步 | SSE 连接状态变化时同步更新 V2 Session 信息 |
| 统一清理入口 | `cleanupStaleResources()` 同时清理两者 |

### Decision 15: 多进程部署限制

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

### 总体架构（SSE + WebSocket 并存）

```
┌─────────────────────────────────────────────────────────────────────┐
│                              前端                                    │
│  ┌──────────────────┐              ┌──────────────────┐            │
│  │   SSE 消费器     │              │  WebSocket 连接   │            │
│  │   (Agent 对话)   │              │   (全局事件)      │            │
│  │                  │              │                   │            │
│  │ fetch +          │              │ onEvent()         │            │
│  │ ReadableStream   │              │                   │            │
│  └────────┬─────────┘              └────────┬─────────┘            │
│           │                                 │                       │
│           │ POST /agent/message             │ WS 连接（保持打开）    │
│           │ (返回 SSE 流)                   │                       │
└───────────┼─────────────────────────────────┼───────────────────────┘
            │                                 │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              后端                                    │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    stream-processor.ts                        │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │                    emitEvent()                          │  │  │
│  │  │                                                         │  │  │
│  │  │   ┌──────────────────┐   ┌──────────────────┐          │  │  │
│  │  │   │ sendToRenderer() │   │ sseWriter.       │          │  │  │
│  │  │   │ → WebSocket      │   │ writeEvent()     │          │  │  │
│  │  │   │                  │   │ → SSE 流          │          │  │  │
│  │  │   └────────┬─────────┘   └────────┬─────────┘          │  │  │
│  │  └────────────┼──────────────────────┼────────────────────┘  │  │
│  │               │                      │                        │  │
│  └───────────────┼──────────────────────┼────────────────────────┘  │
│                  │                      │                            │
│                  ▼                      ▼                            │
│  ┌───────────────────────┐   ┌───────────────────────┐              │
│  │  websocket.service.ts │   │   agent.routes.ts     │              │
│  │                       │   │                       │              │
│  │  - sendFileChange()   │   │  - SSE headers        │              │
│  │  - broadcastToAll()   │   │  - sseWriter 创建      │              │
│  │  - broadcastMcpStatus │   │  - 连接管理            │              │
│  │    (全局事件)          │   │                       │              │
│  └───────────────────────┘   └───────────────────────┘              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

事件流向：
┌─────────────────────────────────────────────────────────────────────┐
│ 事件类型              │ SSE 通道     │ WebSocket 通道  │ 说明        │
├─────────────────────────────────────────────────────────────────────┤
│ agent:message         │ ✓           │ ✓              │ 对话事件    │
│ agent:thought         │ ✓           │ ✓              │ 对话事件    │
│ agent:tool-call       │ ✓           │ ✓              │ 对话事件    │
│ agent:complete        │ ✓           │ ✓              │ 对话事件    │
│ agent:error           │ ✓           │ ✓              │ 对话事件    │
│ mcp:status            │ ✗           │ ✓              │ 全局事件    │
│ file:change           │ ✗           │ ✓              │ 全局事件    │
└─────────────────────────────────────────────────────────────────────┘
```

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
│           │ 用于：agent:* (过渡期)、file:change、mcp:status      │
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
│  - broadcastAgentEvent() ✓ (双通道需要)                          │
│                                                                  │
│  移除功能：                                                       │
│  - conversationSubscriptions ❌                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

### Risk 1: 连接中断导致状态不一致
- **风险**: SSE 连接中断后，AI 可能仍在处理，但前端无法接收结果
- **缓解**:
  - 后端检测连接断开时通过 AbortController 取消 Agent 执行
  - 前端显示"连接中断"提示，用户可重试
  - WebSocket 通道作为备用，前端仍可接收事件

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

### Risk 5: 双通道事件重复
- **风险**: Agent 事件同时发送到 SSE 和 WebSocket，前端可能重复处理
- **缓解**:
  - 前端使用消息 ID 去重
  - 过渡期结束后可选择关闭 WebSocket 的 Agent 事件监听

## Migration Plan

### Phase 1: 实现 SSE 流式响应
1. 创建 `src/server/utils/sse-writer.ts` 工具类
2. 修改 `stream-processor.ts`，实现 `emitEvent()` 同时发送到 SSE 和 WebSocket
3. 修改 `agent.routes.ts` 返回 SSE 流
4. 实现 `activeSSEStreams` 映射管理

### Phase 2: 前端适配
1. 创建 `src/web/api/sse.ts` SSE 消费工具
2. 修改 `chat.store.ts` 使用 fetch + ReadableStream
3. 保留 WebSocket 事件监听器（双通道兼容）

### Phase 3: 清理
1. ~~删除 `sendToRenderer` 函数~~ **保留**（双通道需要）
2. 删除 `src/server/services/websocket.service.ts` 中的订阅相关代码：
   - 删除 `conversationSubscriptions` Map
   - 删除 `subscribeUserToConversation` 函数
   - 删除 `unsubscribeUserFromConversation` 函数
   - **保留** `sendFileChangeEvent`、`broadcastToAll` 和 `broadcastAgentEvent` 函数
3. 删除 `src/web/api/transport.ts` 中订阅相关代码：
   - 删除 `subscribeToConversation` 函数
   - 删除 `unsubscribeFromConversation` 函数
   - **保留** WebSocket 连接和 `onEvent` 函数
4. 添加单元测试和 E2E 测试
