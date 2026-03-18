## 任务依赖关系

```
[1. SSE 基础设施] ──▶ [2. Stream Processor 改造] ──▶ [3. API 路由改造] ──▶ [4. 前端 SSE 消费] ──▶ [5. Chat Store 改造] ──▶ [6. UI 验证] ──▶ [7. 清理与测试]
```

---

## 1. 后端 SSE 基础设施

- [x] 1.1 创建 `src/server/utils/sse-writer.ts` - SSE 写入器工具类
- [x] 1.2 定义 `SseWriter` 接口和 `createSseWriter(res)` 工厂函数
- [x] 1.3 实现 SSE 事件格式化（`event:` 和 `data:` 行，双换行分隔）
- [x] 1.4 添加单元测试 `tests/unit/sse-writer.test.ts`

**依赖**: 无

---

## 2. 后端 Stream Processor 改造

**依赖**: 任务 1 完成

- [x] 2.1 修改 `ProcessStreamParams` 接口，添加可选参数：
  - `sseWriter?: SseWriter` - SSE 模式（主对话）
  - `onEvent?: (eventName: string, data: any) => void` - 回调模式（automation app）
- [x] 2.2 创建 `emitEvent()` 统一事件发送函数，**同时发送到 SSE 和 WebSocket**：
  ```typescript
  function emitEvent(eventName: string, data: any) {
    // 1. 继续发送到 WebSocket（保持兼容性，过渡期）
    sendToRenderer(eventName, spaceId, conversationId, data)

    // 2. 如果有 sseWriter，也发送到 SSE
    if (sseWriter) {
      const sseEventName = eventName.replace('agent:', '')
      sseWriter.writeEvent(sseEventName, data)
    }

    // 3. 如果有 onEvent 回调，也调用回调（automation app）
    if (onEvent) {
      onEvent(eventName, data)
    }
  }
  ```
- [x] 2.3 将所有 `sendToRenderer()` 调用替换为 `emitEvent()`
- [x] 2.4 处理流完成时的 `sseWriter.end()` 调用（仅 SSE 模式）
- [x] 2.5 实现完整的 `errorType` 判断逻辑（rate_limit, auth_failure, interrupted, max_turns, unknown）
- [x] 2.6 确保错误事件包含 `errorCode` 字段（如果可用）
- [x] 2.7 验证 automation app 兼容性：传入 `onEvent` 回调时正常工作
- [x] 2.8 **保留 `broadcastMcpStatus()` 调用不变**（全局事件，仅 WebSocket）

---

## 3. 后端 API 路由改造

**依赖**: 任务 1、2 完成

- [ ] 3.1 修改 `POST /api/v1/agent/message` 返回 SSE 流
- [ ] 3.2 设置正确的响应头：
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
  - `X-Accel-Buffering: no`（禁用 Nginx 缓冲）
- [ ] 3.3 创建 SSE 写入器并传递给 `sendMessage()`
- [ ] 3.4 处理连接断开事件（`req.on('close')`）
- [ ] 3.5 确保认证失败返回 401 JSON（非 SSE 格式）
- [ ] 3.6 **SSE 连接与 V2 Session 生命周期协调**（在 `session-manager.ts` 中实现）：
  - [ ] 3.6.1 扩展 `SessionState` 接口，添加 `sseConnectedAt?: number` 和 `lastActivityAt?: number`
  - [ ] 3.6.2 扩展 `V2SessionInfo` 接口，添加 `isSSEActive?: boolean`
  - [ ] 3.6.3 在 `session-manager.ts` 中创建 `activeSSEStreams` Map（从 agent.routes.ts 移入）
  - [ ] 3.6.4 实现 `registerSSEStream()` 函数（注册连接 + 设置超时定时器 + 同步状态）
  - [ ] 3.6.5 实现 `unregisterSSEStream()` 函数（清理超时定时器 + 同步状态）
  - [ ] 3.6.6 修改 `cleanupStaleSessions()` 为 `cleanupStaleResources()`，同时清理 SSE 和 Session
  - [ ] 3.6.7 实现 `activeSSEStreams` 映射管理（conversationId -> { controller, timeoutId }）
- [ ] 3.7 实现并发连接处理：新连接启动时取消该 conversationId 的旧连接
  - 清理旧连接的超时定时器
  - 调用旧连接的 abort()
  - 删除旧连接的映射条目
  - 取消该对话的等待状态
- [ ] 3.8 修改 `POST /api/v1/agent/stop` 端点，从 `activeSSEStreams` 获取并中断流
- [ ] 3.9 实现增量持久化（事件驱动触发，非定时器）：
  - [ ] 3.9.1 在 `StreamCallbacks` 中添加 `onIncrementalPersist` 回调
  - [ ] 3.9.2 实现 `shouldTryPersist()` 函数判断持久化触发点
  - [ ] 3.9.3 实现 `tryIncrementalPersist()` 函数（带频率限制和错误隔离）
  - [ ] 3.9.4 在关键节点调用增量持久化：text 块结束、tool_result 完成、thinking 累积超过阈值
  - [ ] 3.9.5 在 `finally` 块中执行最后一次增量持久化
  - [ ] 3.9.6 在 `send-message.ts` 中实现 `onIncrementalPersist` 回调
- [ ] 3.10 新增 `waiting-for-input` 事件类型，用于通知前端进入等待状态
- [ ] 3.11 新增 `ask-question` 事件类型，用于 AI 提问场景
- [ ] 3.12 实现双向通信的核心机制：
  - [ ] 3.12.1 在 `session-manager.ts` 中创建 `pendingInputResolvers` Map
  - [ ] 3.12.2 实现 `waitForUserInput()` 函数（Promise + 超时机制）
  - [ ] 3.12.3 实现 `resolveUserInput()` 函数（供 HTTP 端点调用）
  - [ ] 3.12.4 实现 `cancelPendingInput()` 函数（SSE 断开时调用）
  - [ ] 3.12.5 实现 `getPendingInput()` 函数（检查等待状态）
- [ ] 3.13 **工具审批功能（新功能开发）**：
  - [ ] 3.13.1 修改 `sdk-config.ts`：将 `permissionMode` 从 `'bypassPermissions'` 改为 `'default'`
  - [ ] 3.13.2 在 `permission-handler.ts` 中定义需要审批的工具列表（Bash、Edit、Write、NotebookEdit）
  - [ ] 3.13.3 在 `createCanUseTool` 中实现 `handleToolApproval` 函数
  - [ ] 3.13.4 实现 tool-call 事件发送（包含 `requiresApproval: true` 标志）
  - [ ] 3.13.5 实现 waiting-for-input 事件发送（`inputType: 'tool-approval'`）
  - [ ] 3.13.6 调用 `waitForUserInput()` 等待用户审批结果
- [ ] 3.14 修改 `/approve` 端点：调用 `resolveUserInput(conversationId, { approved: true })`
- [ ] 3.15 修改 `/reject` 端点：调用 `resolveUserInput(conversationId, { approved: false })`
- [ ] 3.16 **AskUserQuestion SSE 集成（修改现有实现）**：
  - [ ] 3.16.1 修改 `CanUseToolDeps` 接口，用 `emitEvent` 替代 `sendToRenderer`
  - [ ] 3.16.2 在 `permission-handler.ts` 中发送 `agent:ask-question` 后立即发送 `agent:waiting-for-input`
  - [ ] 3.16.3 确保 `emitEvent` 从 `stream-processor.ts` 正确传入 `createCanUseTool()`
  - [ ] 3.16.4 `/answer-question` 端点保持不变，使用现有 `resolveQuestion()` 机制
- [ ] 3.17 更新 Message 类型定义，添加 `isPartial?: boolean` 字段
- [ ] 3.18 修改 `updateAssistantMessage` 函数，支持 `isPartial` 参数更新
- [ ] 3.19 确保 `isPartial` 状态正确转换：
  - 增量持久化时设置为 `true`
  - 最终持久化（onComplete）时设置为 `false`
  - 历史消息视为 `false`（默认值）

---

## 4. 前端 SSE 消费实现

**依赖**: 任务 2 完成

- [ ] 4.1 创建 `src/web/api/sse.ts` - SSE 消费工具函数
- [ ] 4.2 实现 `sendMessage()` 函数（fetch + ReadableStream）
  - 支持 `SendMessageParams` 接口（spaceId, conversationId, message, images 等）
  - 正确处理非 200 响应（认证失败、参数错误等）
- [ ] 4.3 实现完整的 SSE 事件解析逻辑（`parseSSE` 函数）
  - 支持多行 data 字段（直接拼接）
  - 正确处理不完整事件（保留在 buffer 中）
  - JSON 解析失败时返回原始数据供调试
- [ ] 4.4 添加错误处理（网络中断、流读取错误）

---

## 5. 前端 Chat Store 改造

**依赖**: 任务 4 完成

- [ ] 5.1 修改 `src/web/stores/chat.store.ts` 的 `sendMessage()` 方法
- [ ] 5.2 使用新的 `sendMessage()` SSE 消费函数
- [ ] 5.3 更新消息状态（添加、更新、完成）
- [ ] 5.4 更新思考过程状态（thought、thought-delta 事件处理）
- [ ] 5.5 更新工具调用状态（tool-call、tool-result 事件处理）
- [ ] 5.6 实现错误处理（根据 errorType 显示不同提示）
- [ ] 5.7 处理 `waiting-for-input` 事件，显示等待状态 UI
- [ ] 5.8 处理 `ask-question` 事件，显示问题 UI
- [ ] 5.9 处理增量持久化的部分内容（`isPartial: true` 时显示恢复提示）
- [ ] 5.10 移除 Agent WebSocket 事件监听器（`agent:message`、`agent:thought` 等）

---

## 6. 前端 UI 组件验证

**依赖**: 任务 5 完成

- [ ] 6.1 验证 `ChatView.tsx` 组件正常显示流式消息
  - 验收标准：消息文本实时显示，无闪烁或延迟
- [ ] 6.2 验证 `MessageList.tsx` 组件实时更新
  - 验收标准：增量文本正确追加，isNewTextBlock 正确清空内容
- [ ] 6.3 验证 `ThoughtProcess.tsx` 组件显示思考过程
  - 验收标准：thinking/thought-delta 事件正确更新思考条目
- [ ] 6.4 验证 `MessageItem.tsx` 组件显示工具调用
  - 验收标准：tool-call 显示工具名称和参数，tool-result 显示执行结果

---

## 7. 清理与测试

### 清理代码

> **注意**: 由于采用 SSE + WebSocket 双通道架构，过渡期间 Agent 事件仍通过 WebSocket 发送，
> 因此不删除 `sendToRenderer` 相关函数，仅删除对话订阅逻辑。

**后端 Agent 相关**：
- [ ] 7.1 ~~删除 `src/server/services/agent/helpers.ts` 中的 `sendToRenderer` 函数~~ **保留**（双通道需要）
- [ ] 7.2 保留 `broadcastToAllClients` 函数（用于全局广播）
- [ ] 7.3 保留 `setWebSocketService` 函数（用于非 Agent 事件）

**后端 WebSocket 服务**：
- [ ] 7.4 ~~从 `src/server/services/websocket.service.ts` 中删除 `broadcastAgentEvent` 函数~~ **保留**（双通道需要）
- [ ] 7.5 删除 `conversationSubscriptions` 相关逻辑（Map 和所有引用）
- [ ] 7.6 删除 `subscribeUserToConversation` 和 `unsubscribeUserFromConversation` 函数
- [ ] 7.7 保留 `sendFileChangeEvent` 和 `broadcastToAll` 函数

**前端 transport.ts**：
- [ ] 7.8 删除 `subscribeToConversation` 函数
- [ ] 7.9 删除 `unsubscribeFromConversation` 函数
- [ ] 7.10 删除 `pendingSubscriptions` 相关状态和逻辑
- [ ] 7.11 保留 `connectWebSocket`、`disconnectWebSocket`、`onEvent`（用于非 Agent 事件）
- [ ] 7.12 保留 WebSocket 连接管理逻辑（重连、认证等）

**前端初始化组件**：
- [ ] 7.13 ~~移除 Agent WebSocket 事件监听器注册~~ **保留**（双通道需要）
- [ ] 7.14 保留文件变更事件监听器（`file:change`）

### 功能测试

- [ ] 7.15 手动测试：发送消息，验证 SSE 流正常返回
- [ ] 7.16 手动测试：验证 thinking 过程实时显示
- [ ] 7.17 手动测试：验证 tool_use 和 tool_result 显示
- [ ] 7.18 手动测试：验证上下文压缩（compact）事件处理
- [ ] 7.19 手动测试：验证错误处理
  - `rate_limit` 错误提示
  - `auth_failure` 错误提示
  - `interrupted` 错误提示
  - `max_turns` 错误提示
  - `unknown` 错误提示

### 双向通信场景测试

- [ ] 7.20 手动测试：验证工具审批流程
  - Agent 调用需要审批的工具
  - 前端显示审批 UI
  - 用户批准后 SSE 流继续
- [ ] 7.21 手动测试：验证 AskUserQuestion 流程
  - Agent 提问
  - 前端显示问题 UI
  - 用户回答后 SSE 流继续
- [ ] 7.22 手动测试：验证等待状态取消
  - 用户点击停止按钮
  - SSE 流正确关闭

### 边缘场景测试

- [ ] 7.23 手动测试：验证取消生成功能（`/api/v1/agent/stop`）
- [ ] 7.24 手动测试：验证连接断开检测（关闭标签页后 Agent 任务取消）
- [ ] 7.25 手动测试：验证部分内容恢复
  - 发送消息，中途关闭标签页
  - 重新打开对话，验证部分内容可见
- [ ] 7.26 手动测试：验证多标签页场景
  - 打开两个标签页，在第一个标签页发送消息
  - 第二个标签页无法看到实时更新（符合预期）
  - 第二个标签页刷新后可看到完整对话历史
- [ ] 7.27 手动测试：验证并发请求
  - 在第一个标签页发送消息，立即刷新页面
  - 验证旧连接被取消，新连接正常工作

### WebSocket 保留功能测试

- [ ] 7.28 手动测试：验证文件变更通知仍然工作
- [ ] 7.29 手动测试：验证全局广播仍然工作

### SSE + WebSocket 双通道测试

- [ ] 7.30 手动测试：验证 Agent 事件同时发送到 SSE 和 WebSocket
  - 打开浏览器 DevTools Network 面板
  - 发送消息，验证 SSE 流接收事件
  - 同时检查 WebSocket 面板，验证也收到相同事件
- [ ] 7.31 手动测试：验证 MCP 状态变更仅通过 WebSocket 广播
  - 触发 MCP 服务器状态变更
  - 验证 WebSocket 收到 `mcp:status` 事件
  - 验证 SSE 流不包含该事件
- [ ] 7.32 手动测试：验证前端可以只使用 SSE 通道
  - 修改前端代码，忽略 WebSocket 的 Agent 事件
  - 验证对话功能正常工作

### 日志验证

- [ ] 7.33 检查 AI 日志文件，确认 `ai_request` 日志被记录
- [ ] 7.34 检查 AI 日志文件，确认 `ai_response` 日志包含完整 tokenUsage
- [ ] 7.35 检查 AI 日志文件，确认 `ai_stream_chunk` 日志按规则记录

### 自动化测试

- [ ] 7.36 添加单元测试 `tests/unit/sse-writer.test.ts`
- [ ] 7.37 添加单元测试 `tests/unit/sse-parser.test.ts`（前端 SSE 解析）
- [ ] 7.38 添加 E2E 测试 `tests/e2e/specs/agent-sse.spec.ts`

### 文档更新

- [ ] 7.39 更新 API 文档，说明新的 SSE 响应格式
- [ ] 7.40 更新部署文档，说明反向代理配置要求（禁用缓冲）
