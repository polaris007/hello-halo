## Why

当前项目的 B/S 架构中，`POST /api/v1/agent/message` 仅保存消息到数据库后返回静态提示，无法提供 AI 对话功能。用户需要在浏览器中体验与 Electron 桌面版相同的实时流式 AI 对话，包括思考过程、工具调用执行、错误处理等完整功能。

## What Changes

- **新增服务端 Agent 服务模块**：从 Electron 主进程迁移核心 AI 对话逻辑到服务端
  - V2 Session 管理（进程复用避免冷启动）
  - Token 级流式响应处理
  - Thought 累积和工具结果合并
  - WebSocket 事件推送机制

- **重写 Agent API 路由**：将 `POST /api/v1/agent/message` 从占位实现改为完整 AI 对话端点
  - 异步消息处理
  - 实时流式响应通过 WebSocket 推送
  - 支持停止生成、工具批准/拒绝等控制操作

- **增强 WebSocket 服务**：
  - 对话级订阅管理（subscribe/unsubscribe）
  - Agent 事件广播机制

- **BREAKING**: 移除对 Electron 主进程的依赖，Agent 功能完全在服务端运行

## Capabilities

### New Capabilities
- `server-agent`: 服务端 Agent 核心服务，包含 V2 Session 管理、流处理、事件推送
- `agent-websocket-events`: WebSocket Agent 事件订阅和广播机制

### Modified Capabilities
- `agent-api`: 修改消息发送端点行为，从静态保存改为流式 AI 对话

## Impact

- **服务端代码**: 新增 `src/server/services/agent/` 目录，包含迁移后的核心逻辑
- **API 路由**: `src/server/routes/agent.routes.ts` 重写 message/stop/approve/reject 端点
- **WebSocket 服务**: `src/server/services/websocket.service.ts` 增强订阅功能
- **前端代码**: 无需重大修改，WebSocket 事件处理已存在
- **依赖**: 服务端需要 `@anthropic-ai/claude-agent-sdk`，无需 Electron 模块
