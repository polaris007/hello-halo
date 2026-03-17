## Why

当前 Agent 消息 API (`POST /api/v1/agent/message`) 采用"fire-and-forget"模式：后端立即返回 JSON 响应 `{ status: "processing" }`，然后通过 WebSocket 异步推送实时事件。虽然代码中有 `pendingSubscriptions` 队列机制来缓冲订阅请求，但仍存在以下问题：

**请求与响应分离的复杂性**：
- HTTP 请求立即返回，实际响应通过 WebSocket 推送，前端需要维护两套通信状态
- 错误处理复杂：HTTP 层错误（如 401、500）与 WebSocket 推送的 `agent:error` 事件需要分别处理
- 调试困难：无法通过单个网络请求追踪完整的请求-响应链路

**WebSocket 维护成本**：
- 需要处理连接断开重连、心跳检测、认证状态同步等边缘情况
- 当前 WebSocket 服务 (`websocket.service.ts`) 和 `transport.ts` 中的连接管理代码（约 200 行）需要持续维护
- 服务器需要维护连接池，增加内存开销

**多标签页/多设备限制**：
- SSE 方案下每个标签页独立连接，天然隔离
- WebSocket 需要额外的广播逻辑才能支持多标签页同步

**项目决策**：团队已决定使用 SSE（Server-Sent Events）替代 WebSocket，将消息响应改为流式返回，简化架构并消除上述问题。

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
   - 保留 WebSocket 用于非对话场景（如实时通知、文件变更广播）

### 其他变更

3. **Automation App 兼容性**
   - `stream-processor.ts` 同时被主对话 agent 和 automation app runtime 使用
   - SSE 模式下 `sseWriter` 可选，automation app 可继续使用 `sendToRenderer` 通过 WebSocket 推送
   - 详见 design.md Decision 2

4. **移除 WebSocket 对话依赖**（后续任务）
   - 当前 WebSocket 服务 (`websocket.service.ts`) 暂时保留
   - 待 SSE 稳定后再移除相关代码

5. **回滚支持**
   - 实现环境变量 `HALO_USE_SSE=true/false` 开关（默认 `true`）
   - 开关为 `false` 时，API 返回原有 JSON 格式，事件继续通过 WebSocket 推送
   - 通过条件判断选择传输方式，避免同时维护两套完整代码
   - 回滚开关为临时方案，待 SSE 稳定后移除（预计 1-2 个版本后）

## Capabilities

### New Capabilities

- `streaming-agent-response`: SSE 流式响应能力，将 Claude Agent SDK 的消息流转换为 HTTP SSE 格式推送给前端

### Modified Capabilities

- `ai-interaction-logging`: 已有规范覆盖 AI 请求/响应日志记录，无需修改规范层级的需求

## Impact

### 受影响的代码

- `src/server/routes/agent.routes.ts` - 路由处理器需要返回 SSE 流
- `src/server/services/agent/stream-processor.ts` - 新增 `sseWriter` 参数，支持 SSE 事件写入
- `src/server/services/agent/send-message.ts` - 传递 `sseWriter` 给 `processStream`
- `src/server/services/agent/helpers.ts` - `sendToRenderer` 函数需支持 SSE 模式
- `src/server/utils/sse-writer.ts` - **新增** SSE 写入器工具类
- `src/web/api/sse.ts` - **新增** SSE 消费工具函数
- `src/web/api/transport.ts` - 保留 WebSocket 用于非对话场景，对话部分改用 SSE
- `src/web/stores/chat.store.ts` - 消息发送和事件处理逻辑

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
   - 缓解：新标签页通过 `GET /api/v1/agent/session/:id` 恢复当前状态；若需要实时同步可作为后续需求

2. **连接中断**
   - 风险：SSE 连接中断后，AI 可能仍在处理，但前端无法接收结果
   - 缓解：后端检测连接断开时通过 AbortController 取消 Agent 执行；前端显示"连接中断"提示，用户可重试

3. **回滚开关复杂度**
   - 风险：回滚开关增加了代码复杂度和测试工作量
   - 缓解：开关为临时方案，SSE 稳定后立即移除；通过清晰的代码隔离降低复杂度
