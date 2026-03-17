## Context

### 当前状态

Agent 消息 API 的数据流：
```
前端 POST /api/v1/agent/message
    ↓
后端 agent.routes.ts:85 调用 sendMessage()
    ↓
后端立即返回 JSON { success: true, data: { messageId, status: "processing" } }
    ↓
sendMessage() 通过 sendToRenderer() 推送事件
    ↓
sendToRenderer() 调用 websocketService.broadcastAgentEvent()
    ↓
WebSocket 推送给已订阅的前端客户端
```

**现有机制**：
- 前端 `transport.ts` 已实现 `pendingSubscriptions` 队列，在 WebSocket 认证成功后自动处理待订阅请求
- 该机制可解决订阅时序问题，但仍需要维护两套通信机制

**改进动机**：
1. **架构简化**：HTTP 请求与响应分离增加了调试和维护复杂度
2. **错误处理统一**：HTTP 错误（401、500）与 WebSocket 推送的 `agent:error` 需要分别处理
3. **调试体验**：无法通过单个网络请求追踪完整的请求-响应链路

### 约束

- 必须使用 SSE（项目已决定替代 WebSocket）
- 必须复用现有的 `stream-processor.ts` 逻辑
- API 签名变更需要兼容现有前端调用

## Goals / Non-Goals

**Goals:**
1. 将 `POST /api/v1/agent/message` 改为返回 SSE 流式响应
2. 前端能够实时接收 thinking、tool_use、text 等事件
3. 保持 AI 日志记录功能正常工作
4. 确保错误能通过 SSE 流正确传递给前端

**Non-Goals:**
1. 对话列表功能（独立 change）
2. 移除 WebSocket 代码（后续任务）
3. 多设备同步（未来需求）

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
data: {"type":"agent:error","spaceId":"...","conversationId":"...","error":"...","errorType":"..."}
```

### Decision 2: stream-processor.ts 改造

**选择**: 引入可选的 SSE Writer，与 `sendToRenderer()` 共存

**理由**:
- `stream-processor.ts` 已有完整的事件处理逻辑
- `stream-processor.ts` 同时被主对话 agent (`send-message.ts`) 和 automation app runtime (`execute.ts`) 使用
- 最小化代码改动，保持向后兼容

**SSE vs WebSocket 的关键区别**：
- `sendToRenderer` 通过 WebSocket 广播，可通知**所有订阅该 conversationId 的客户端**
- SSE 只能向**发起请求的单个客户端**推送
- 对于主对话场景，SSE 已足够（每个标签页独立连接）
- 对于 automation app，继续使用 `sendToRenderer` 通过 WebSocket 推送（因为无 HTTP 请求上下文）

**改造方式**:
```typescript
// ProcessStreamParams 新增可选参数
interface ProcessStreamParams {
  // ... existing fields
  sseWriter?: SseWriter  // 可选：SSE 写入器。若不提供，则使用 sendToRenderer
}

// SseWriter 接口
interface SseWriter {
  writeEvent(event: string, data: any): void
  end(): void
}

// processStream 内部的条件逻辑
function processStream(params: ProcessStreamParams) {
  const { sseWriter, spaceId, conversationId, ... } = params

  // 统一的事件发送函数
  const emitEvent = (eventName: string, data: any) => {
    if (sseWriter) {
      // SSE 模式：直接写入 HTTP 响应流
      sseWriter.writeEvent(eventName, data)
    } else {
      // WebSocket 模式：广播给所有订阅者
      sendToRenderer(eventName, spaceId, conversationId, data)
    }
  }

  // 使用 emitEvent 替代所有 sendToRenderer 调用
  emitEvent('agent:message', { type: 'message', content: '...', isStreaming: true })
}
```

**Automation App 兼容性**：
- Automation app 调用 `processStream` 时不传递 `sseWriter`
- 事件继续通过 `sendToRenderer` -> WebSocket 推送给前端
- 无需修改 automation app 代码

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
    // 尝试解析错误信息
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

    // 检查是否是完整的事件（需要找到结束的双换行）
    // 从当前位置向后查找空行
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
        dataLines.push(line.substring(5).trim())
      }
      // 忽略其他 SSE 字段（id:, retry: 等）
    }

    // 合并多行 data
    if (dataLines.length > 0) {
      const dataStr = dataLines.join('')
      try {
        parsed.push({
          event: eventType,
          data: JSON.parse(dataStr)
        })
      } catch (e) {
        console.error('Failed to parse SSE data JSON:', dataStr, e)
        // 不丢弃事件，返回原始字符串供调试
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

**错误类型映射**（与 `stream-processor.ts` 代码对应）：

| errorType | 触发条件 | 代码位置 |
|-----------|---------|---------|
| `rate_limit` | API 返回速率限制错误 | `parseSDKMessage` 解析 error thought，`thought.errorCode` 包含具体错误码 |
| `auth_failure` | API Key 无效或过期 | 同上 |
| `interrupted` | 用户取消或网络中断 | `getInterruptedErrorMessage()` 在 `wasAborted` 或 `isInterrupted` 时发送 |
| `max_turns` | 达到 SDK maxTurns 限制 | `hadMaxTurnsReached` 为 true 时发送 |

**实现注意**：
当前 `stream-processor.ts:884-888` 只发送 `errorType: 'interrupted'`，需要在实现时补充其他类型的判断逻辑：

```typescript
// 发送错误事件时的类型判断
const getErrorType = (): string => {
  if (wasAborted) return 'interrupted'
  if (hadMaxTurnsReached) return 'max_turns'
  if (hasErrorThought) {
    // 根据 error thought 的 errorCode 判断
    const code = errorThought?.errorCode?.toLowerCase() || ''
    if (code.includes('rate') || code.includes('limit')) return 'rate_limit'
    if (code.includes('auth') || code.includes('api_key') || code.includes('invalid_key')) return 'auth_failure'
    return 'unknown'
  }
  if (isInterrupted) return 'interrupted'
  return 'unknown'
}
```

## Architecture

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

## Risks / Trade-offs

### Risk 1: 连接中断导致状态不一致
- **风险**: SSE 连接中断后，AI 可能仍在处理，但前端无法接收结果
- **缓解**:
  - 后端检测连接断开时通过 AbortController 取消 Agent 执行
  - 前端重连后可通过 `GET /api/v1/agent/session/:id` 恢复状态

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
  - 添加定时检查机制，清理超时的 AbortController（如连接超过 10 分钟）
  - 监控 Map 大小，超过阈值时告警

### Trade-off: 放弃 WebSocket 双向通信（对话场景）
- **代价**: 无法主动推送非对话类事件（如文件变更通知）
- **接受**:
  - 当前需求聚焦对话功能
  - WebSocket 保留用于非对话场景（如 automation app 事件推送）
  - 文件变更通知可作为后续独立需求

## Migration Plan

### Phase 1: 实现 SSE 流式响应
1. 创建 `src/server/utils/sse-writer.ts` 工具类
2. 修改 `stream-processor.ts`，添加 `sseWriter` 可选参数和 `emitEvent` 统一发送函数
3. 修改 `agent.routes.ts` 返回 SSE 流

### Phase 2: 前端适配
1. 创建 `src/web/api/sse.ts` SSE 消费工具
2. 修改 `chat.store.ts` 使用 fetch + ReadableStream
3. 保留 `transport.ts` 中的 WebSocket 用于非对话场景

### Phase 3: 测试与清理
1. 添加单元测试和 E2E 测试
2. 验证 AI 日志记录正常
3. SSE 稳定后移除回滚开关（预计 1-2 个版本后）

### 回滚策略

**环境变量**: `HALO_USE_SSE=true/false`（默认 `true`）

**实现方式**:
```typescript
// agent.routes.ts
router.post('/message', async (req, res) => {
  const useSSE = process.env.HALO_USE_SSE !== 'false'

  if (useSSE) {
    // SSE 模式
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const sseWriter = createSseWriter(res)
    // ... 传递给 sendMessage
  } else {
    // 传统 JSON 响应模式（回滚时使用）
    res.json({ success: true, data: { messageId, status: 'processing' } })
    // sendMessage 内部继续使用 sendToRenderer -> WebSocket
  }
})
```

**回滚步骤**:
1. 设置环境变量 `HALO_USE_SSE=false`
2. 重启服务器
3. 前端自动降级（检测到非 SSE 响应后切换到 WebSocket 模式）

**注意**: 回滚开关为临时方案，不维护两套完整前端代码。前端需要能同时处理两种响应模式。

## Open Questions

~~1. **AbortController 处理**: 当前通过 WebSocket 取消，SSE 下如何处理？~~
   - **已决定**: 保留 `POST /api/v1/agent/stop` 端点，通过 conversationId 取消
   - 实现方式: 后端维护 `activeSSEStreams: Map<string, AbortController>` 映射
   - `/stop` 端点调用对应 AbortController 的 `abort()` 方法

~~2. **多标签页同步**: 用户在多个标签页打开同一对话，如何同步？~~
   - **已决定**: 每个 SSE 连接独立，通过数据库共享消息状态
   - 新标签页可通过 `GET /api/v1/agent/session/:id` 恢复当前状态
   - 不支持实时多标签页同步（后续可考虑 WebSocket 广播作为补充）

## Decisions (续)

### Decision 5: AbortController 管理

**选择**: 维护全局 `activeSSEStreams` 映射

**实现**:
```typescript
// 在 agent service 中维护
const activeSSEStreams = new Map<string, AbortController>()

// POST /api/v1/agent/message 启动时注册
activeSSEStreams.set(conversationId, abortController)

// 流结束时清理
activeSSEStreams.delete(conversationId)

// POST /api/v1/agent/stop 调用
const controller = activeSSEStreams.get(conversationId)
if (controller) {
  controller.abort()
  // 发送 SSE error 事件后关闭连接
}
```

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
