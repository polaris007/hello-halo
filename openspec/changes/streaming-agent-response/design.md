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
  sseWriter: SseWriter  // SSE 写入器（必填）
}

// SseWriter 接口
interface SseWriter {
  writeEvent(event: string, data: any): void
  end(): void
}

// processStream 内部
function processStream(params: ProcessStreamParams) {
  const { sseWriter, spaceId, conversationId, ... } = params

  // 统一的事件发送函数
  const emitEvent = (eventName: string, data: any) => {
    // SSE event-name 去掉 "agent:" 前缀
    const sseEventName = eventName.replace('agent:', '')
    sseWriter.writeEvent(sseEventName, { ...data, spaceId, conversationId })
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

**实现**:
```typescript
// 在 agent routes 中维护
const activeSSEStreams = new Map<string, AbortController>()

// POST /api/v1/agent/message 处理
router.post('/message', async (req, res) => {
  const { conversationId } = req.body

  // 1. 取消该 conversationId 的旧连接（如果有）
  const existingController = activeSSEStreams.get(conversationId)
  if (existingController) {
    existingController.abort()
    activeSSEStreams.delete(conversationId)
  }

  // 2. 创建新的 AbortController
  const abortController = new AbortController()
  activeSSEStreams.set(conversationId, abortController)

  try {
    // 3. 设置 SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // 4. 监听连接断开
    req.on('close', () => {
      abortController.abort()
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
    // 6. 确保所有路径都清理资源
    activeSSEStreams.delete(conversationId)
    abortController.abort() // 确保任务被取消
  }
})

// POST /api/v1/agent/stop 调用
router.post('/stop', async (req, res) => {
  const { conversationId } = req.body
  const controller = activeSSEStreams.get(conversationId)
  if (controller) {
    controller.abort()
    // 注意：不要在这里删除，让 finally 块处理
  }
  res.json({ success: true })
})
```

**资源释放保证清单**:

| 场景 | 清理机制 | 说明 |
|-----|---------|------|
| 正常完成 | `finally` 块 | `activeSSEStreams.delete()` + `abort()` |
| 错误终止 | `finally` 块 | 同上 |
| 用户取消 | `finally` 块（`abort()` 触发错误） | 同上 |
| 客户端断开 | `req.on('close')` + `finally` | abort 先触发，finally 后清理 |
| 超时清理 | 超时定时器 + `finally` | 见 Decision 11 |
| 新连接替换 | 新连接启动时主动取消 | 先 abort + delete 旧条目 |

### Decision 6: SSE 连接断开检测

**选择**: 使用 `req.on('close')` 事件

**实现**:
```typescript
// agent.routes.ts
req.on('close', () => {
  const controller = activeSSEStreams.get(conversationId)
  if (controller) {
    controller.abort()
    activeSSEStreams.delete(conversationId)
    console.log(`[Agent] Client disconnected, aborting: ${conversationId}`)
  }
})
```

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

**实现要点**:
1. `session-manager.ts` 中维护 `pendingApproval` 状态
2. `stream-processor.ts` 检测到 `requiresApproval` 时发送 `waiting-for-input` 事件
3. `/approve` 和 `/reject` 端点修改为继续当前 SSE 流而非启动新流程
4. 前端 `chat.store.ts` 设置 `pendingToolApproval` 状态，显示审批 UI

### Decision 8: AskUserQuestion 工具处理

**问题**: AskUserQuestion 工具需要用户回答问题，如何处理？

**选择**: 与工具审批类似的机制，SSE 流保持打开等待用户回答

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

**实现要点**:
1. 复用现有的 `handleAskQuestion` 和 `answerQuestion` 逻辑
2. 修改 `/answer-question` 端点以支持 SSE 流继续
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
1. 删除 `src/server/services/agent/helpers.ts` 中的 `sendToRenderer` 函数
2. 删除 `src/server/services/websocket.service.ts`
3. 删除 `src/web/api/transport.ts` 中 WebSocket 相关代码
4. 添加单元测试和 E2E 测试
