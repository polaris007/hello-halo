## 任务依赖关系

```
[1. SSE 基础设施] ──┬──▶ [2. Stream Processor 改造] ──▶ [3. API 路由改造] ──▶ [4. 消息发送流程]
                   │
                   └──▶ [5. 前端 SSE 消费] ──▶ [6. Chat Store 改造] ──▶ [7. UI 组件适配]

注意：任务 5 依赖任务 2 完成后确定的事件格式，不能完全并行
```

---

## 1. 后端 SSE 基础设施

- [ ] 1.1 创建 `src/server/utils/sse-writer.ts` - SSE 写入器工具类
- [ ] 1.2 定义 `SseWriter` 接口和 `createSseWriter(res)` 工厂函数
- [ ] 1.3 实现 SSE 事件格式化（`event:` 和 `data:` 行，双换行分隔）
- [ ] 1.4 添加单元测试 `tests/unit/sse-writer.test.ts`
- [ ] 1.5 实现环境变量开关 `HALO_USE_SSE=true/false`（回滚支持）

**依赖**: 无

---

## 2. 后端 Stream Processor 改造

**依赖**: 任务 1 完成

- [ ] 2.1 修改 `ProcessStreamParams` 接口，添加 `sseWriter` 可选参数
- [ ] 2.2 创建 `emitEvent()` 统一事件发送函数（内部判断使用 SSE 或 WebSocket）
- [ ] 2.3 将所有 `sendToRenderer()` 调用替换为 `emitEvent()`
- [ ] 2.4 处理流完成时的 `sseWriter?.end()` 调用
- [ ] 2.5 实现完整的 `errorType` 判断逻辑（rate_limit, auth_failure, interrupted, max_turns, unknown）
- [ ] 2.6 确保错误通过 SSE `event: error` 传递
- [ ] 2.7 添加 `compact` 事件的 SSE 格式支持

**Automation App 兼容性验证**：
- [ ] 2.8 验证不传递 `sseWriter` 时，事件仍通过 `sendToRenderer` -> WebSocket 推送

---

## 3. 后端 API 路由改造

**依赖**: 任务 1、2 完成

- [ ] 3.1 修改 `POST /api/v1/agent/message` 返回 SSE 流
- [ ] 3.2 设置正确的响应头：
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- [ ] 3.3 创建 SSE 写入器并传递给 `sendMessage()`
- [ ] 3.4 处理连接断开事件（`req.on('close')`）
- [ ] 3.5 确保认证失败返回 401 JSON（非 SSE 格式）
- [ ] 3.6 实现 `activeSSEStreams` 映射管理（conversationId -> AbortController）
- [ ] 3.7 实现回滚开关 `HALO_USE_SSE=true/false`：
  - 开关为 `true`（默认）：返回 SSE 流
  - 开关为 `false`：返回原有 JSON 格式，事件通过 WebSocket 推送

---

## 4. 后端消息发送流程

**依赖**: 任务 1、2、3 完成

- [ ] 4.1 修改 `sendMessage()` 函数签名，添加 `sseWriter` 可选参数
- [ ] 4.2 传递 `sseWriter` 给 `processStream()`
- [ ] 4.3 验证 AI 日志记录（`ai-logger.ts`）在 SSE 模式下正常
- [ ] 4.4 修改 `POST /api/v1/agent/stop` 端点，从 `activeSSEStreams` 获取并中断流

---

## 5. 前端 SSE 消费实现

**依赖**: 任务 2 完成（需要确定的事件格式）

- [ ] 5.1 创建 `src/web/api/sse.ts` - SSE 消费工具函数
- [ ] 5.2 实现 `sendMessage()` 函数（fetch + ReadableStream）
  - 支持 `SendMessageParams` 接口（spaceId, conversationId, message, images 等）
  - 正确处理非 200 响应（认证失败、参数错误等）
- [ ] 5.3 实现完整的 SSE 事件解析逻辑（`parseSSE` 函数）
  - 支持多行 data 字段
  - 正确处理不完整事件（保留在 buffer 中）
  - JSON 解析失败时返回原始数据供调试
- [ ] 5.4 添加错误处理和重试机制
- [ ] 5.5 实现 `getAuthToken()` 集成

---

## 6. 前端 Chat Store 改造

**依赖**: 任务 5 完成

- [ ] 6.1 修改 `src/web/stores/chat.store.ts` 的 `sendMessage()` 方法
- [ ] 6.2 使用新的 `sendMessage()` SSE 消费函数
- [ ] 6.3 更新消息状态（添加、更新、完成）
- [ ] 6.4 更新思考过程状态（thought、thought-delta 事件处理）
- [ ] 6.5 更新工具调用状态（tool-call、tool-result 事件处理）
- [ ] 6.6 实现错误处理（根据 errorType 显示不同提示）
- [ ] 6.7 保留 `transport.ts` 中的 WebSocket 用于非对话场景（如 automation app 事件）

---

## 7. 前端 UI 组件适配

**依赖**: 任务 6 完成

- [ ] 7.1 验证 `ChatView.tsx` 组件正常显示流式消息
  - 验收标准：消息文本实时显示，无闪烁或延迟
- [ ] 7.2 验证 `MessageList.tsx` 组件实时更新
  - 验收标准：增量文本正确追加，isNewTextBlock 正确清空内容
- [ ] 7.3 验证 `ThoughtProcess.tsx` 组件显示思考过程
  - 验收标准：thinking/thought-delta 事件正确更新思考条目
- [ ] 7.4 验证 `MessageItem.tsx` 组件显示工具调用
  - 验收标准：tool-call 显示工具名称和参数，tool-result 显示执行结果

---

## 8. 测试与验证

### 功能测试
- [ ] 8.1 手动测试：发送消息，验证 SSE 流正常返回
- [ ] 8.2 手动测试：验证 thinking 过程实时显示
- [ ] 8.3 手动测试：验证 tool_use 和 tool_result 显示
- [ ] 8.4 手动测试：验证上下文压缩（compact）事件处理
- [ ] 8.5 手动测试：验证错误处理
  - `rate_limit` 错误提示
  - `auth_failure` 错误提示
  - `interrupted` 错误提示
  - `max_turns` 错误提示
  - `unknown` 错误提示

### 边缘场景测试
- [ ] 8.6 手动测试：验证取消生成功能（`/api/v1/agent/stop`）
- [ ] 8.7 手动测试：验证连接断开检测（关闭标签页后 Agent 任务取消）
- [ ] 8.8 手动测试：验证多标签页场景
  - 打开两个标签页，在第一个标签页发送消息
  - 第二个标签页无法看到实时更新（符合预期）
  - 第二个标签页刷新后可看到完整对话历史
- [ ] 8.9 手动测试：验证回滚开关
  - 设置 `HALO_USE_SSE=false`，验证返回 JSON 格式
  - 验证前端能正确处理两种响应模式

### 日志验证
- [ ] 8.10 检查 AI 日志文件，确认 `ai_request` 日志被记录
- [ ] 8.11 检查 AI 日志文件，确认 `ai_response` 日志包含完整 tokenUsage
- [ ] 8.12 检查 AI 日志文件，确认 `ai_stream_chunk` 日志采样记录

### 自动化测试
- [ ] 8.13 添加单元测试 `tests/unit/sse-writer.test.ts`
- [ ] 8.14 添加单元测试 `tests/unit/sse-parser.test.ts`（前端 SSE 解析）
- [ ] 8.15 添加 E2E 测试 `tests/e2e/specs/agent-sse.spec.ts`

---

## 9. 清理与文档

- [ ] 9.1 更新 API 文档，说明新的 SSE 响应格式
- [ ] 9.2 更新 CLAUDE.md（如有必要）
- [ ] 9.3 SSE 稳定后（预计 1-2 个版本）：
  - 移除回滚开关代码
  - 移除 `transport.ts` 中 WebSocket 对话相关代码
  - 完全移除 WebSocket 用于对话场景
