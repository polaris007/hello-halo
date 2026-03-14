## MODIFIED Requirements

### Requirement: 发送消息到 Agent
POST /api/v1/agent/message 端点 SHALL 触发 AI 对话流程，而非仅保存消息。

#### Scenario: 发起 AI 对话
- **GIVEN** 用户已认证并拥有指定空间
- **WHEN** 用户发送 POST /api/v1/agent/message 请求
- **THEN** 服务端 SHALL 保存用户消息到数据库
- **AND** 启动异步 AI 处理流程
- **AND** 立即返回成功响应（不等待 AI 完成）
- **AND** AI 响应 SHALL 通过 WebSocket 流式推送

#### Scenario: 支持多模态消息
- **GIVEN** 用户发送的消息包含图片附件
- **WHEN** 服务端处理消息请求
- **THEN** 服务端 SHALL 将图片作为多模态内容传递给 AI
- **AND** AI SHALL 能够理解和响应图片内容

#### Scenario: 支持思考模式
- **GIVEN** 用户启用思考模式（thinkingEnabled=true）
- **WHEN** 服务端调用 AI
- **THEN** 服务端 SHALL 配置 SDK 使用扩展思考（maxThinkingTokens: 10240）
- **AND** 思考过程 SHALL 通过 WebSocket 推送给前端

#### Scenario: 会话复用
- **GIVEN** 对话已有之前的 Session ID
- **WHEN** 用户发送新消息
- **THEN** 服务端 SHALL 复用现有的 V2 Session
- **AND** 保持对话上下文连续性

#### Scenario: 无效请求处理
- **GIVEN** 请求缺少必要参数（spaceId、conversationId、message）
- **WHEN** 服务端接收请求
- **THEN** 服务端 SHALL 返回 400 错误
- **AND** 包含 INVALID_REQUEST 错误码

#### Scenario: 空间不存在
- **GIVEN** 请求的空间不存在或不属于当前用户
- **WHEN** 服务端处理请求
- **THEN** 服务端 SHALL 返回 404 错误
- **AND** 包含 NOT_FOUND 错误码

## ADDED Requirements

### Requirement: 停止生成
POST /api/v1/agent/stop 端点 SHALL 中断正在进行的 AI 生成。

#### Scenario: 停止活跃生成
- **GIVEN** 指定对话正在进行 AI 生成
- **WHEN** 用户发送 POST /api/v1/agent/stop 请求
- **THEN** 服务端 SHALL 触发该对话的 AbortController
- **AND** 中断 SDK 流处理
- **AND** 推送中断状态的完成事件

#### Scenario: 无活跃生成
- **GIVEN** 指定对话没有进行中的 AI 生成
- **WHEN** 用户发送停止请求
- **THEN** 服务端 SHALL 返回成功响应
- **AND** 不产生任何副作用

### Requirement: 批准工具调用
POST /api/v1/agent/approve 端点 SHALL 批准待处理的工具调用。

#### Scenario: 批准待处理工具
- **GIVEN** 指定对话有待批准的工具调用
- **WHEN** 用户发送 POST /api/v1/agent/approve 请求
- **THEN** 服务端 SHALL 批准该工具调用
- **AND** 允许 AI 继续执行

### Requirement: 拒绝工具调用
POST /api/v1/agent/reject 端点 SHALL 拒绝待处理的工具调用。

#### Scenario: 拒绝待处理工具
- **GIVEN** 指定对话有待批准的工具调用
- **WHEN** 用户发送 POST /api/v1/agent/reject 请求
- **THEN** 服务端 SHALL 拒绝该工具调用
- **AND** 通知 AI 工具调用被拒绝

### Requirement: 获取会话状态
GET /api/v1/agent/session/:conversationId 端点 SHALL 返回对话的当前状态。

#### Scenario: 获取活跃会话状态
- **GIVEN** 指定对话有活跃的 AI 会话
- **WHEN** 用户发送 GET 请求
- **THEN** 服务端 SHALL 返回会话状态：
  - isActive: true
  - thoughts: 当前的思考过程列表
  - lastMessage: 最后一条消息

#### Scenario: 获取非活跃会话状态
- **GIVEN** 指定对话没有活跃的 AI 会话
- **WHEN** 用户发送 GET 请求
- **THEN** 服务端 SHALL 返回 isActive: false
- **AND** 返回历史消息信息
