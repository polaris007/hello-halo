## Context

### 当前状态

Agent 消息 API 的数据流：
```
前端 POST /api/v1/agent/message
    ↓
后端 agent.routes.ts:85 调用 sendMessage()
    ↓
后端立即返回 JSON { status: "processing" }
    ↓
sendMessage() 通过 sendToRenderer() 推送事件
    ↓
sendToRenderer() 调用 websocketService.broadcastAgentEvent()
    ↓
WebSocket 推送给前端（但前端可能未正确订阅）
```

**问题根因**：
1. API 返回 "fire-and-forget" 模式，前端无法接收后续事件
2. WebSocket 订阅机制需要前端主动订阅 conversationId
3. 前端 `transport.ts` 的 `connectWebSocket()` 依赖 token，可能在认证前未连接

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

**SSE 事件格式**:
```
event: message
data: {"type":"agent:message","content":"...","isStreaming":true}

event: thought
data: {"type":"agent:thought","thought":{...}}

event: complete
data: {"type":"agent:complete","tokenUsage":{...}}

event: error
data: {"type":"agent:error","error":"..."}
```

### Decision 2: stream-processor.ts 改造

**选择**: 引入 SSE Writer 回调，替代 `sendToRenderer()`

**理由**:
- `stream-processor.ts` 已有完整的事件处理逻辑
- 只需将 `sendToRenderer()` 替换为 SSE 写入
- 最小化代码改动

**改造方式**:
```typescript
// ProcessStreamParams 新增
interface ProcessStreamParams {
  // ... existing fields
  sseWriter: SseWriter  // 新增：SSE 写入器
}

// SseWriter 接口
interface SseWriter {
  writeEvent(event: string, data: any): void
  end(): void
}
```

### Decision 3: 前端消费方式

**选择**: 使用 `fetch` + `ReadableStream` 而非原生 `EventSource`

**理由**:
- `EventSource` 只支持 GET 请求
- 需要 POST 发送消息内容
- `fetch` + `ReadableStream` 可以处理 POST + SSE

**前端代码示例**:
```typescript
async function sendMessage(conversationId: string, message: string) {
  const response = await fetch('/api/v1/agent/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ conversationId, message })
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const text = decoder.decode(value)
    // 解析 SSE 事件并更新 UI
    parseSSE(text)
  }
}
```

### Decision 4: 错误处理

**选择**: 错误通过 SSE `event: error` 发送，然后关闭流

**理由**:
- 前端统一处理所有事件
- 保持 HTTP 响应状态码为 200（SSE 规范）
- 错误内容在事件体中传递

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
  - 后端检测连接断开时取消 Agent 执行
  - 前端重连后可通过 `GET /api/v1/agent/session/:id` 恢复状态

### Risk 2: 认证 Token 过期
- **风险**: 长时间 SSE 连接期间 token 过期
- **缓解**: SSE 连接在请求时验证 token，不进行中间刷新。超长任务应考虑分片

### Risk 3: 浏览器并发连接限制
- **风险**: 浏览器对同域名有并发连接限制（通常 6 个）
- **缓解**: 对话场景下用户通常只有 1-2 个活跃连接，影响较小

### Trade-off: 放弃 WebSocket 双向通信
- **代价**: 无法主动推送非对话类事件（如文件变更）
- **接受**: 当前需求聚焦对话功能，文件变更可作为后续独立需求

## Migration Plan

### Phase 1: 实现 SSE 流式响应
1. 修改 `agent.routes.ts` 返回 SSE 流
2. 创建 `SseWriter` 工具类
3. 修改 `stream-processor.ts` 支持 SSE 写入

### Phase 2: 前端适配
1. 修改 `chat.store.ts` 使用 fetch + ReadableStream
2. 移除 `transport.ts` 中的 WebSocket 依赖（对话部分）

### Phase 3: 清理
1. 保留 WebSocket 用于非对话场景（暂时）
2. 添加废弃标记

### 回滚策略
- 保留原有 `sendToRenderer` 函数
- 通过环境变量 `HALO_USE_SSE=true/false` 切换
- 默认使用 SSE，回滚时改回 WebSocket

## Open Questions

1. **AbortController 处理**: 当前通过 WebSocket 取消，SSE 下如何处理？
   - 建议: 保留 `POST /api/v1/agent/stop` 端点，通过 conversationId 取消

2. **多标签页同步**: 用户在多个标签页打开同一对话，如何同步？
   - 建议: 每个 SSE 连接独立，通过数据库共享消息状态
