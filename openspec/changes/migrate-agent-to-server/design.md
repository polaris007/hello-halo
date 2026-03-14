## Context

当前项目的 B/S 架构中，`POST /api/v1/agent/message` 端点仅将消息保存到数据库后返回静态提示，无法调用 AI 大模型进行对话。完整的 AI 对话功能目前只在 Electron 主进程中实现，通过 IPC 与前端通信。

用户需要在浏览器中体验与 Electron 桌面版相同的实时流式 AI 对话，包括：
- Token 级流式响应显示
- 思考过程（thinking）实时展示
- 工具调用（tool_use）执行过程
- 错误处理和恢复

## Goals / Non-Goals

**Goals:**
- 将 Electron 主进程中的 AI Agent 核心逻辑迁移到服务端
- 实现服务端与前端之间的实时流式通信（WebSocket）
- 支持 V2 Session 复用，避免每次对话的冷启动延迟（3-5s）
- 保持与 Electron 版本相同的事件类型和数据格式
- 支持停止生成、工具批准/拒绝等控制操作

**Non-Goals:**
- 不修改前端 UI 组件（ChatView、MessageList 等）
- 不添加新的 AI 提供商支持
- 不修改数据库 schema
- 不实现 AI Browser 功能（根据项目改造计划已移除）

## Decisions

### 1. 架构模式：服务端 V2 Session + WebSocket 推送

**决策**: 在服务端维护 V2 Session 映射，通过 WebSocket 将流式事件推送到前端。

**理由**:
- Claude Agent SDK 的 V2 Session 设计用于长时间运行的进程，支持跨消息复用
- WebSocket 已经是项目的一部分，前端已有事件监听机制
- 与现有 Electron 架构的事件模型保持一致

**替代方案**:
- Server-Sent Events (SSE): 单向通信，无法实现工具批准/拒绝等交互
- HTTP 轮询: 延迟高，效率低
- 长轮询: 复杂度高，不如 WebSocket 直接

### 2. Electron 依赖处理：条件编译 + 接口抽象

**决策**: 创建抽象层隔离 Electron 特有 API，服务端使用替代实现。

**需要处理的 Electron 依赖**:
- `BrowserWindow`: 用于 IPC 通信，服务端改为 WebSocket 推送
- `app`: 用于获取应用路径，服务端使用 `process.cwd()` 或环境变量
- `app.getPath()`: 用于获取用户数据目录，服务端使用固定路径 `~/.halo/`

**实现策略**:
```typescript
// helpers.ts 中的 sendToRenderer 改造
export function sendToRenderer(
  channel: string,
  spaceId: string,
  conversationId: string,
  data: Record<string, unknown>
): void {
  const eventData = { ...data, spaceId, conversationId }

  // 服务端模式：通过 WebSocket 推送
  broadcastAgentEvent(channel, eventData)
}
```

### 3. 会话状态管理：内存映射 + 定期清理

**决策**: 使用内存 Map 存储 V2 Session，按 conversationId 索引。

**理由**:
- V2 Session 是运行时状态，不需要持久化
- 按 conversationId 索引便于快速查找和清理
- 需要定期清理长时间未使用的会话防止内存泄漏

**数据结构**:
```typescript
// V2 Session 映射
const v2Sessions = new Map<string, V2SessionInfo>()

// 活跃会话状态（用于中断控制）
const activeSessions = new Map<string, SessionState>()
```

### 4. WebSocket 订阅机制：对话级订阅

**决策**: 前端订阅特定对话，服务端只推送已订阅对话的事件。

**实现**:
- 前端发送 `subscribe` 消息携带 `conversationId`
- 服务端维护 `userId -> Set<conversationId>` 映射
- Agent 事件只推送给订阅了该对话的用户

**消息格式**:
```typescript
// 订阅请求
{ type: 'subscribe', payload: { conversationId: 'xxx' } }

// Agent 事件推送
{
  type: 'agent:event',
  payload: {
    eventType: 'agent:message',
    data: { content: '...', spaceId: '...', conversationId: '...' }
  }
}
```

### 5. 配置管理：从配置文件读取

**决策**: API 凭证和 MCP 配置从服务端配置文件读取。

**理由**:
- 根据项目改造计划，AI 提供商改为配置文件或界面直接配置
- 多租户场景下，配置可以按用户隔离存储

**配置位置**:
- `~/.halo/config.json` 或 `~/.halo/users/{user_id}/config.json`

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **内存泄漏**：V2 Session 长期驻留内存 | 高 | 实现会话超时清理机制，长时间未使用自动关闭 |
| **进程残留**：Claude Code 子进程异常退出 | 中 | 添加进程健康检查，定期扫描并清理僵尸进程 |
| **并发冲突**：同一对话多个请求同时处理 | 中 | 使用 activeSessions 跟踪活跃请求，拒绝重复请求 |
| **配置热更新**：API 凭证变更后需要重启 | 低 | 实现配置变更检测，自动重建受影响的 Session |
| **WebSocket 可靠性**：连接断开导致事件丢失 | 中 | 前端实现重连机制，服务端支持重新订阅 |

## Migration Plan

### 阶段 1：核心服务迁移
1. 创建 `src/server/services/agent/` 目录结构
2. 迁移 `types.ts`、`helpers.ts`、`sdk-config.ts`
3. 改造 `sendToRenderer` 为 WebSocket 推送

### 阶段 2：流处理迁移
1. 迁移 `message-utils.ts`、`stream-processor.ts`
2. 适配服务端的 Session 管理方式
3. 移除 Electron 依赖

### 阶段 3：会话管理迁移
1. 迁移 `session-manager.ts`
2. 实现内存中的 Session 映射
3. 添加健康检查和清理机制

### 阶段 4：主逻辑迁移
1. 迁移 `send-message.ts`
2. 集成到 `agent.routes.ts`
3. 重写 `POST /api/v1/agent/message` 端点

### 阶段 5：控制操作迁移
1. 实现 `POST /api/v1/agent/stop`
2. 实现 `POST /api/v1/agent/approve`
3. 实现 `POST /api/v1/agent/reject`

### 阶段 6：WebSocket 增强
1. 增强 `websocket.service.ts` 的订阅功能
2. 实现对话级事件过滤
3. 测试事件推送流程

## Open Questions

1. **配置存储**：AI 凭证是存储在全局配置还是按用户隔离？
   - 建议：按用户隔离，路径 `~/.halo/users/{user_id}/config.json`

2. **会话超时**：V2 Session 空闲多久后自动关闭？
   - 建议：30 分钟

3. **MCP 服务器**：是否需要在服务端支持 MCP？
   - 根据改造计划，AI Browser 已移除，但 Halo Apps MCP 可能需要保留

4. **错误处理**：SDK 错误如何优雅地返回给前端？
   - 通过 `agent:error` 事件推送错误信息
