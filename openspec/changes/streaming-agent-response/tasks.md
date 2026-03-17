## 1. 后端 SSE 基础设施

- [ ] 1.1 创建 `src/server/utils/sse-writer.ts` - SSE 写入器工具类
- [ ] 1.2 定义 `SseWriter` 接口和 `createSseWriter(res)` 工厂函数
- [ ] 1.3 实现 SSE 事件格式化（`event:` 和 `data:` 行）
- [ ] 1.4 添加单元测试 `tests/unit/server/sse-writer.test.ts`

## 2. 后端 Stream Processor 改造

- [ ] 2.1 修改 `ProcessStreamParams` 接口，添加 `sseWriter` 参数
- [ ] 2.2 修改 `processStream()` 函数，支持 SSE 写入模式
- [ ] 2.3 将 `sendToRenderer()` 调用替换为 `sseWriter.writeEvent()`
- [ ] 2.4 处理流完成时的 `sseWriter.end()` 调用
- [ ] 2.5 确保错误通过 SSE `event: error` 传递

## 3. 后端 API 路由改造

- [ ] 3.1 修改 `POST /api/v1/agent/message` 返回 SSE 流
- [ ] 3.2 设置正确的响应头（`Content-Type: text/event-stream`）
- [ ] 3.3 禁用响应缓冲（`res.setHeader('Cache-Control', 'no-cache')`）
- [ ] 3.4 创建 SSE 写入器并传递给 `sendMessage()`
- [ ] 3.5 处理连接断开事件（`req.on('close')`）
- [ ] 3.6 确保认证失败返回 401 JSON（非 SSE）

## 4. 后端消息发送流程修复

- [ ] 4.1 修改 `sendMessage()` 函数签名，支持 SSE 模式
- [ ] 4.2 确保 Agent SDK 调用链路正常工作
- [ ] 4.3 验证 AI 日志记录（`ai-logger.ts`）在 SSE 模式下正常
- [ ] 4.4 添加调试日志，确认 SDK 调用确实发生

## 5. 前端 SSE 消费实现

- [ ] 5.1 创建 `src/web/api/sse.ts` - SSE 消费工具函数
- [ ] 5.2 实现 `consumeAgentStream()` 函数（fetch + ReadableStream）
- [ ] 5.3 实现 SSE 事件解析逻辑
- [ ] 5.4 添加错误处理和重试机制

## 6. 前端 Chat Store 改造

- [ ] 6.1 修改 `src/web/stores/chat.store.ts` 的 `sendMessage()` 方法
- [ ] 6.2 移除 WebSocket 订阅逻辑
- [ ] 6.3 使用新的 `consumeAgentStream()` 消费 SSE
- [ ] 6.4 更新消息状态（添加、更新、完成）
- [ ] 6.5 更新思考过程状态
- [ ] 6.6 更新工具调用状态

## 7. 前端 UI 组件适配

- [ ] 7.1 验证 `ChatView.tsx` 组件正常显示流式消息
- [ ] 7.2 验证 `MessageList.tsx` 组件实时更新
- [ ] 7.3 验证 `ThoughtProcess.tsx` 组件显示思考过程
- [ ] 7.4 验证 `MessageItem.tsx` 组件显示工具调用

## 8. 测试与验证

- [ ] 8.1 手动测试：发送消息，验证 SSE 流正常返回
- [ ] 8.2 手动测试：验证 thinking 过程实时显示
- [ ] 8.3 手动测试：验证 tool_use 和 tool_result 显示
- [ ] 8.4 手动测试：验证错误处理（API 错误、网络断开）
- [ ] 8.5 手动测试：验证取消生成功能
- [ ] 8.6 检查 AI 日志文件，确认请求/响应被记录
- [ ] 8.7 添加 E2E 测试 `tests/e2e/specs/agent-sse.spec.ts`

## 9. 清理与文档

- [ ] 9.1 移除或标记废弃 `transport.ts` 中的 WebSocket 对话相关代码
- [ ] 9.2 更新 API 文档，说明新的 SSE 响应格式
- [ ] 9.3 更新 CLAUDE.md 和 openspec/config.yaml（已完成）
