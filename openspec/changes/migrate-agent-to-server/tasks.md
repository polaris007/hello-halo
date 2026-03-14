## 1. 基础类型和工具函数迁移

- [x] 1.1 创建 `src/server/services/agent/types.ts` - 从旧项目迁移类型定义，移除 Electron 依赖
- [x] 1.2 创建 `src/server/services/agent/helpers.ts` - 迁移辅助函数，改造 `sendToRenderer` 为 WebSocket 推送
- [ ] 1.3 创建 `src/server/services/agent/sdk-config.ts` - 迁移 SDK 配置逻辑

## 2. 消息工具函数迁移

- [ ] 2.1 创建 `src/server/services/agent/message-utils.ts` - 迁移消息格式化、解析工具
- [ ] 2.2 创建 `src/server/services/agent/system-prompt.ts` - 迁移系统提示词构建逻辑

## 3. 流处理器迁移

- [ ] 3.1 创建 `src/server/services/agent/stream-processor.ts` - 迁移核心流处理逻辑
- [ ] 3.2 适配服务端的 `sendToRenderer` 调用
- [ ] 3.3 确保所有 Agent 事件正确推送到 WebSocket

## 4. 会话管理器迁移

- [ ] 4.1 创建 `src/server/services/agent/session-manager.ts` - 迁移 V2 Session 管理
- [ ] 4.2 移除 Electron 的 `app` 模块依赖，使用服务端路径方案
- [ ] 4.3 实现会话健康检查和超时清理机制

## 5. 核心发送逻辑迁移

- [ ] 5.1 创建 `src/server/services/agent/send-message.ts` - 迁移主发送逻辑
- [ ] 5.2 移除 `BrowserWindow` 依赖，使用纯服务端实现
- [ ] 5.3 集成 WebSocket 事件推送
- [ ] 5.4 实现消息持久化到数据库

## 6. Agent 服务索引

- [ ] 6.1 创建 `src/server/services/agent/index.ts` - 导出 Agent 服务公共 API

## 7. WebSocket 服务增强

- [ ] 7.1 修改 `src/server/services/websocket.service.ts` - 实现对话级订阅管理
- [ ] 7.2 添加 `subscribe` 和 `unsubscribe` 消息处理
- [ ] 7.3 实现 `sendAgentEvent` 广播函数
- [ ] 7.4 添加用户到订阅对话的映射管理

## 8. Agent API 路由重写

- [ ] 8.1 重写 `POST /api/v1/agent/message` - 集成 Agent 服务，启动异步处理
- [ ] 8.2 实现 `POST /api/v1/agent/stop` - 停止生成功能
- [ ] 8.3 实现 `POST /api/v1/agent/approve` - 批准工具调用
- [ ] 8.4 实现 `POST /api/v1/agent/reject` - 拒绝工具调用
- [ ] 8.5 重写 `GET /api/v1/agent/session/:conversationId` - 返回真实会话状态

## 9. 配置管理

- [ ] 9.1 创建 `src/server/services/agent/config-reader.ts` - 读取 AI 提供商配置
- [ ] 9.2 实现从 `~/.halo/config.json` 读取 API 凭证
- [ ] 9.3 支持多用户场景下的配置隔离

## 10. 测试和验证

- [ ] 10.1 测试 WebSocket 连接和订阅功能
- [ ] 10.2 测试消息发送和流式响应
- [ ] 10.3 测试思考过程显示
- [ ] 10.4 测试工具调用和结果
- [ ] 10.5 测试错误处理和恢复
- [ ] 10.6 测试停止生成功能
- [ ] 10.7 验证会话复用正常工作
