## Why

当前 Agent 消息 API (`POST /api/v1/agent/message`) 返回普通 JSON 响应后立即结束，前端无法接收 AI 处理过程中的实时事件（thinking、tool_use、text_delta 等）。这导致对话功能无法正常工作——用户发送消息后看不到任何响应。

根本原因：API 设计采用了"请求-响应"模式，但 Claude Agent SDK 的消息流需要持久连接来推送实时事件。项目已决定使用 SSE（Server-Sent Events）替代 WebSocket，现在需要实现这一架构。

## What Changes

### **BREAKING** API 变更

1. **`POST /api/v1/agent/message`** 返回类型从 JSON 改为 SSE 流
   - 移除当前的 `{ success, data: { messageId, status } }` 响应格式
   - 返回 `Content-Type: text/event-stream` 的 SSE 流
   - 流中推送 `agent:message`、`agent:thought`、`agent:complete` 等事件

2. **前端消息发送流程重构**
   - 移除 WebSocket 连接和订阅机制
   - 使用 `EventSource` 或 `fetch` + `ReadableStream` 消费 SSE 流
   - 实时展示 thinking、tool_use、text 等内容块

3. **后端 Agent 调用链路修复**
   - 确保 `/api/v1/agent/message` 路由正确调用 `sendMessage` 函数
   - `sendMessage` 内部调用 Claude Agent SDK 并将事件流转换为 SSE 格式

### 其他变更

4. **移除 WebSocket 依赖**（可选，作为后续任务）
   - 当前 WebSocket 服务 (`websocket.service.ts`) 暂时保留
   - 待 SSE 稳定后再移除相关代码

## Capabilities

### New Capabilities

- `streaming-agent-response`: SSE 流式响应能力，将 Claude Agent SDK 的消息流转换为 HTTP SSE 格式推送给前端

### Modified Capabilities

- `ai-interaction-logging`: 已有规范覆盖 AI 请求/响应日志记录，无需修改规范层级的需求

## Impact

### 受影响的代码

- `src/server/routes/agent.routes.ts` - 路由处理器需要返回 SSE 流
- `src/server/services/agent/stream-processor.ts` - 将 `sendToRenderer` 改为 SSE 事件写入
- `src/web/api/transport.ts` - 移除 WebSocket 依赖，改用 SSE 消费
- `src/web/stores/chat.store.ts` - 消息发送和事件处理逻辑

### API 变更

```
# Before
POST /api/v1/agent/message
Response: { success: true, data: { messageId, status: "processing" } }

# After
POST /api/v1/agent/message
Response: Content-Type: text/event-stream
Event stream:
  event: message
  data: {"type":"agent:message","content":"...",...}

  event: thought
  data: {"type":"agent:thought","thought":{...},...}

  event: complete
  data: {"type":"agent:complete","tokenUsage":{...}}
```

### 依赖项

- 无新增外部依赖，使用浏览器原生 `EventSource` 或 `fetch` API
