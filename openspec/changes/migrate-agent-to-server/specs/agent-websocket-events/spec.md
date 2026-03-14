## ADDED Requirements

### Requirement: WebSocket 连接管理
服务端 SHALL 管理 WebSocket 连接的生命周期和认证。

#### Scenario: 连接建立
- **WHEN** 客户端尝试建立 WebSocket 连接
- **THEN** 服务端 SHALL 验证用户 token
- **AND** 接受连接并存储客户端信息

#### Scenario: 认证失败
- **WHEN** 客户端提供无效或已过期的 token
- **THEN** 服务端 SHALL 拒绝连接
- **AND** 返回 4001 状态码

#### Scenario: 连接断开
- **WHEN** 客户端断开 WebSocket 连接
- **THEN** 服务端 SHALL 清理该客户端的所有订阅
- **AND** 从活跃客户端列表中移除

### Requirement: 对话订阅管理
服务端 SHALL 支持客户端订阅特定对话的事件。

#### Scenario: 订阅对话
- **WHEN** 客户端发送 subscribe 消息携带 conversationId
- **THEN** 服务端 SHALL 将该对话添加到用户的订阅列表
- **AND** 后续该对话的 Agent 事件 SHALL 推送给此客户端

#### Scenario: 取消订阅
- **WHEN** 客户端发送 unsubscribe 消息携带 conversationId
- **THEN** 服务端 SHALL 从用户的订阅列表中移除该对话

#### Scenario: 多对话订阅
- **WHEN** 客户端订阅多个对话
- **THEN** 服务端 SHALL 独立跟踪每个订阅
- **AND** 只推送已订阅对话的事件

### Requirement: Agent 事件推送
服务端 SHALL 通过 WebSocket 向订阅客户端推送 Agent 事件。

#### Scenario: 消息事件推送
- **WHEN** Agent 产生新的消息内容（text_delta）
- **THEN** 服务端 SHALL 推送 `agent:message` 事件
- **AND** 事件数据 SHALL 包含 spaceId、conversationId、content

#### Scenario: 思考事件推送
- **WHEN** Agent 产生思考内容
- **THEN** 服务端 SHALL 推送 `agent:thought` 或 `agent:thought-delta` 事件
- **AND** 事件数据 SHALL 包含 thought 的完整信息

#### Scenario: 工具调用事件推送
- **WHEN** Agent 发起工具调用
- **THEN** 服务端 SHALL 推送 `agent:tool-call` 事件
- **AND** 事件数据 SHALL 包含 toolName、toolInput、status

#### Scenario: 工具结果事件推送
- **WHEN** 工具执行完成
- **THEN** 服务端 SHALL 推送 `agent:tool-result` 事件
- **AND** 事件数据 SHALL 包含 output、isError

#### Scenario: 完成事件推送
- **WHEN** Agent 流处理完成
- **THEN** 服务端 SHALL 推送 `agent:complete` 事件
- **AND** 事件数据 SHALL 包含最终状态、token 使用量

#### Scenario: 错误事件推送
- **WHEN** Agent 处理过程中发生错误
- **THEN** 服务端 SHALL 推送 `agent:error` 事件
- **AND** 事件数据 SHALL 包含 error 类型和消息

### Requirement: 事件过滤
服务端 SHALL 只向订阅了特定对话的客户端推送该对话的事件。

#### Scenario: 未订阅对话的事件过滤
- **GIVEN** 用户 A 订阅了对话 X，用户 B 没有订阅
- **WHEN** 对话 X 产生 Agent 事件
- **THEN** 服务端 SHALL 只向用户 A 推送事件
- **AND** 用户 B SHALL 不会收到该事件

#### Scenario: 多用户订阅同一对话
- **GIVEN** 用户 A 和用户 B 都订阅了对话 X
- **WHEN** 对话 X 产生 Agent 事件
- **THEN** 服务端 SHALL 向用户 A 和用户 B 都推送事件

### Requirement: 事件格式规范
所有 Agent 事件 SHALL 遵循统一的格式规范。

#### Scenario: 事件格式验证
- **WHEN** 服务端推送 Agent 事件
- **THEN** 事件 SHALL 包含以下字段：
  - `type`: "agent:event"
  - `payload.eventType`: 事件类型（如 "agent:message"）
  - `payload.data`: 事件数据对象
  - `payload.data.spaceId`: 空间 ID
  - `payload.data.conversationId`: 对话 ID
