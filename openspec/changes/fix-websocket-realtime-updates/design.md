## Context

当前系统架构中，前端通过HTTP发送消息到后端，后端立即返回"processing"状态，然后通过WebSocket异步推送AI的流式响应。但在实际运行中存在以下问题：

1. **WebSocket服务未正确注入到Agent服务**: `src/server/services/agent/helpers.ts` 中的 `sendToRenderer` 函数依赖 `websocketService`，但该服务需要在服务器启动时正确初始化并注入。

2. **前端订阅管理不完善**: 前端在发送消息前会调用 `subscribeToConversation`，但订阅确认和事件接收机制存在问题。

3. **事件广播范围不正确**: `broadcastAgentEvent` 函数只向订阅了特定对话的用户推送事件，但订阅关系可能没有正确建立。

4. **对话状态同步缺失**: 左侧栏对话列表的状态依赖于 `chat.store.ts` 中的 `deriveTaskStatus`，但会话状态可能没有正确更新。

## Goals / Non-Goals

**Goals:**
- 修复WebSocket服务与Agent服务的集成，确保AI流式响应事件能够正确广播到前端
- 确保前端能够正确接收并处理 `agent:message`, `agent:thought`, `agent:complete` 等事件
- 实现左侧栏对话列表的实时状态同步（Generating/Waiting/Error等状态）
- 添加WebSocket连接状态监控和自动重连机制

**Non-Goals:**
- 不修改AI SDK的调用方式
- 不修改数据库存储结构
- 不添加新的API端点
- 不修改消息内容的渲染逻辑

## Decisions

### 1. WebSocket服务初始化方式

**决策**: 在服务器启动时，将WebSocket服务实例注入到Agent helpers中。

**理由**:
- 保持现有代码结构，最小化改动
- 避免循环依赖（WebSocket服务需要Agent控制器，Agent需要WebSocket广播）

**替代方案**:
- 使用事件总线模式：引入额外的复杂度，当前系统不需要
- 直接导入WebSocket模块：会导致循环依赖

### 2. 事件广播机制

**决策**: 保持现有的 `broadcastAgentEvent` 机制，但确保订阅关系正确建立。

**理由**:
- 对话级别的订阅能够精确控制事件推送范围
- 减少不必要的事件传输

**关键修复点**:
- 确保前端 `subscribeToConversation` 在WebSocket连接成功后发送
- 后端正确处理 `subscribe` 消息并建立订阅关系

### 3. 前端状态更新机制

**决策**: 保持现有的Zustand store结构，确保事件处理函数正确更新状态。

**理由**:
- 现有store结构已经支持多对话状态管理
- 只需要确保事件能够正确触发状态更新

### 4. 连接状态监控

**决策**: 在前端添加WebSocket连接状态指示器和自动重连。

**理由**:
- 用户需要知道连接状态以理解为什么消息没有响应
- 自动重连能够提高用户体验

**实现**:
- 利用现有的 `wsReconnectTimer` 机制
- 添加连接状态指示UI（可选）

## Risks / Trade-offs

**[Risk] WebSocket连接不稳定导致事件丢失** → Mitigation:
- 实现心跳检测机制
- 前端定期同步会话状态（轮询作为fallback）
- 添加"刷新"按钮让用户可以手动同步状态

**[Risk] 大量并发对话导致WebSocket消息拥塞** → Mitigation:
- 当前实现已经使用对话级别订阅，只会推送相关事件
- 监控WebSocket消息频率，必要时添加节流

**[Risk] 向后兼容性** → Mitigation:
- 保持现有事件格式不变
- 确保修改只影响内部实现，不影响API契约

## Migration Plan

1. **Phase 1**: 修复WebSocket服务注入
   - 修改服务器启动代码，确保WebSocket服务正确注入Agent helpers

2. **Phase 2**: 验证事件流
   - 测试消息发送、流式响应、完成事件的完整流程

3. **Phase 3**: 修复对话状态同步
   - 确保左侧栏能够正确显示对话状态

4. **Phase 4**: 添加连接状态监控（可选）
   - 添加WebSocket连接状态UI指示器

## Open Questions

1. 是否需要添加心跳检测机制来检测连接状态？
2. 在WebSocket断开时，是否需要自动降级为轮询模式获取对话状态？
3. 是否需要限制单个用户的WebSocket连接数？
