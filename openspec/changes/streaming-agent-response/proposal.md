## Why

当前 Agent 消息 API (`POST /api/v1/agent/message`) 采用"fire-and-forget"模式：后端立即返回 JSON 响应 `{ success: true, data: { messageId, conversationId, status: "processing", message: "消息已接收，AI 正在处理中" } }`，然后通过 WebSocket 异步推送实时事件。虽然代码中有 `pendingSubscriptions` 队列机制来缓冲订阅请求，但仍存在以下问题：

**请求与响应分离的复杂性**：
- HTTP 请求立即返回，实际响应通过 WebSocket 推送，前端需要维护两套通信状态
- 错误处理复杂：HTTP 层错误（如 401、500）与 WebSocket 推送的 `agent:error` 事件需要分别处理
- 调试困难：无法通过单个网络请求追踪完整的请求-响应链路

**WebSocket 维护成本**：
- 需要处理连接断开重连、心跳检测、认证状态同步等边缘情况
- WebSocket 服务 (`websocket.service.ts`) 和 `transport.ts` 中的连接管理代码需要持续维护
- 服务器需要维护连接池，增加内存开销

**项目决策**：使用 SSE（Server-Sent Events）替代 WebSocket，将消息响应改为流式返回，简化架构并消除上述问题。

## What Changes

### **BREAKING** API 变更

1. **`POST /api/v1/agent/message`** 返回类型从 JSON 改为 SSE 流
   - 移除当前的 `{ success, data: { messageId, status } }` 响应格式
   - 返回 `Content-Type: text/event-stream` 的 SSE 流
   - 流中推送 `agent:message`、`agent:thought`、`agent:complete` 等事件

2. **前端消息发送流程重构**
   - 移除 WebSocket 对话相关的订阅逻辑
   - 使用 `fetch` + `ReadableStream` 消费 SSE 流（不支持 `EventSource`，因为需要 POST 请求）
   - 实时展示 thinking、tool_use、text 等内容块

3. **保留 WebSocket 用于非 Agent 事件**
   - WebSocket 服务**保留**，但仅用于非 Agent 场景：
     - 文件变更通知（`file:change` 事件）
     - 全局广播（`broadcastToAll`）
   - Agent 对话相关订阅逻辑**移除**：
     - `subscribeToConversation`、`unsubscribeFromConversation` 函数
     - `conversationSubscriptions` Map（存储对话订阅关系）
   - Agent 事件路由（`agent:event` 消息类型）**移除**

4. **双向通信场景的处理方案**
   - **工具审批（Tool Approval）**：SSE 流暂停等待，用户审批后通过独立 HTTP 端点继续
   - **AskUserQuestion**：SSE 流暂停等待，用户回答后通过独立 HTTP 端点继续
   - 详见 design.md 中的 Decision 7 和 Decision 8

## Capabilities

### New Capabilities

- `streaming-agent-response`: SSE 流式响应能力，将 Claude Agent SDK 的消息流转换为 HTTP SSE 格式推送给前端

### Modified Capabilities

- `ai-interaction-logging`: 已有规范覆盖 AI 请求/响应日志记录，无需修改规范层级的需求

## Impact

### 受影响的代码

**后端**：
- `src/server/routes/agent.routes.ts` - 路由处理器需要返回 SSE 流
- `src/server/services/agent/stream-processor.ts` - 使用 SSE Writer 替代 `sendToRenderer`
- `src/server/services/agent/send-message.ts` - 传递 SSE Writer 给 `processStream`
- `src/server/services/agent/helpers.ts` - 删除 `sendToRenderer` 函数，保留 `broadcastToAllClients` 函数（用于全局广播）
- `src/server/utils/sse-writer.ts` - **新增** SSE 写入器工具类
- `src/server/services/websocket.service.ts` - **保留** 但移除 `broadcastAgentEvent` 函数

**前端**：
- `src/web/api/sse.ts` - **新增** SSE 消费工具函数
- `src/web/api/transport.ts` - 移除 Agent 相关订阅逻辑，保留 WebSocket 连接（用于文件变更等事件）
- `src/web/api/index.ts` - 更新 `sendMessage` 调用方式
- `src/web/stores/chat.store.ts` - 消息发送和事件处理逻辑
- `src/web/App.tsx` 或初始化组件 - 移除 Agent WebSocket 事件监听器

### API 变更

```
# Before
POST /api/v1/agent/message
Request Body: { spaceId, conversationId, message, images?, aiBrowserEnabled?, thinkingEnabled?, canvasContext? }
Response: { success: true, data: { messageId, status: "processing" } }

# After
POST /api/v1/agent/message
Request Body: { spaceId, conversationId, message, images?, aiBrowserEnabled?, thinkingEnabled?, canvasContext? }
Response: Content-Type: text/event-stream
Event stream:
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

  event: ask-question
  data: {"type":"agent:ask-question","spaceId":"...","conversationId":"...","id":"...","questions":[...]}

  event: waiting-for-input
  data: {"type":"agent:waiting-for-input","spaceId":"...","conversationId":"...","inputType":"...","message":"..."}

  event: complete
  data: {"type":"agent:complete","spaceId":"...","conversationId":"...","tokenUsage":{...}}

  event: error
  data: {"type":"agent:error","spaceId":"...","conversationId":"...","error":"...","errorType":"..."}
```

**请求参数说明**（与现有 API 一致，无变更）：
- `spaceId`: 空间 ID（必填）
- `conversationId`: 对话 ID（必填）
- `message`: 用户消息内容（必填）
- `images`: 图片数组（可选，多模态支持）
- `aiBrowserEnabled`: 是否启用 AI 浏览器（可选）
- `thinkingEnabled`: 是否启用思考过程（可选）
- `canvasContext`: Canvas 上下文（可选）

### 依赖项

- 无新增外部依赖，使用浏览器原生 `fetch` API（注意：`EventSource` 只支持 GET 请求，本项目需要 POST，故使用 `fetch` + `ReadableStream`）

### 风险与缓解

1. **多标签页实时同步**
   - 风险：每个 SSE 连接独立，打开第二个标签页无法看到第一个标签页的实时更新
   - 缓解：
     - 第二个标签页通过 `GET /api/v1/agent/session/:id` 可恢复当前 thoughts 状态
     - 但无法实时接收后续事件（符合 SSE 单连接设计）
     - 用户刷新或切换后，可通过对话历史查看完整消息

2. **连接中断**
   - 风险：SSE 连接中断后，AI 可能仍在处理，但前端无法接收结果
   - 缓解：
     - 后端检测连接断开时通过 AbortController 取消 Agent 执行
     - 已流式生成的部分内容已在数据库中实时更新（增量持久化）
     - 前端显示"连接中断"提示，用户可重试

3. **并发请求**
   - 风险：同一 conversationId 同时存在多个 SSE 连接（如用户快速刷新页面）
   - 缓解：新连接启动时，取消该 conversationId 的前一个活跃连接，确保只有一个活跃 SSE 流

4. **工具审批和 AskUserQuestion 等待状态**
   - 风险：SSE 是单向通信，无法直接处理需要用户输入的场景
   - 缓解：
     - SSE 流保持打开，发送 `waiting-for-input` 事件通知前端
     - 用户操作后通过独立 HTTP 端点（`/approve`、`/reject`、`/answer-question`）提交
     - 后端继续处理，事件继续通过同一个 SSE 流推送
     - 详见 design.md Decision 7 和 Decision 8

5. **认证错误在 SSE headers 之后**
   - 风险：如果在发送 SSE headers 之后才发现认证问题（如 token 过期中间检查），无法返回 JSON 错误
   - 缓解：
     - 认证验证在发送 SSE headers 之前完成
     - 如果验证失败，返回标准 HTTP 错误响应（401 JSON），不建立 SSE 流

6. **反向代理兼容性**
   - 风险：某些反向代理（Nginx、CDN）可能缓冲 SSE 响应
   - 缓解：
     - 设置正确的响应头：`Cache-Control: no-cache`、`X-Accel-Buffering: no`
     - 本地开发模式不经过代理，不受影响
     - 文档中说明部署配置要求

7. **SSE 重连与部分内容恢复**
   - 风险：连接中断后重连，如何恢复已生成的部分内容
   - 缓解：
     - 后端在流式生成过程中实时更新数据库中的 assistant message
     - 前端重连后通过 `GET /api/v1/conversations/:id` 获取最新消息内容
     - 如果 AI 仍在处理中，用户可发送"continue"消息继续
