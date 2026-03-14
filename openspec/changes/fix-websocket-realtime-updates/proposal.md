## Why

当前用户在对话界面输入消息后，界面一直显示"思考中..."，左侧栏对话列表也一直显示"Generating..."，无法及时看到AI处理结果。这是因为后端虽然通过WebSocket推送流式响应事件，但存在事件广播机制不完整、前端订阅管理不完善的问题。需要修复WebSocket实时更新机制，确保用户能够及时看到AI的响应进度和结果。

## What Changes

- 修复WebSocket服务与Agent服务之间的集成，确保AI流式响应事件能够正确广播到前端
- 完善对话列表状态同步机制，左侧栏能够实时反映各对话的处理状态
- 优化前端WebSocket连接管理和事件订阅逻辑
- 添加WebSocket连接状态监控和自动重连机制
- **BREAKING**: 修改Agent事件广播接口，统一使用WebSocket服务进行事件推送

## Capabilities

### New Capabilities
- `websocket-event-broadcast`: WebSocket事件广播机制，支持对话级别的消息订阅和广播
- `conversation-status-sync`: 对话状态实时同步，左侧栏能够显示各对话的生成状态

### Modified Capabilities
- `agent-message-streaming`: 修改AI消息流式推送的实现，从直接调用改为通过WebSocket服务广播

## Impact

- **后端**: `src/server/services/websocket.service.ts`, `src/server/services/agent/helpers.ts`, `src/server/services/agent/send-message.ts`
- **前端**: `src/renderer/api/transport.ts`, `src/renderer/stores/chat.store.ts`
- **API**: WebSocket事件格式和订阅机制
- **依赖**: 无新增依赖
