## ADDED Requirements

### Requirement: V2 Session 管理
服务端 SHALL 维护 V2 Session 的生命周期，支持跨消息复用。

#### Scenario: 创建新会话
- **WHEN** 用户首次向对话发送消息
- **THEN** 服务端 SHALL 使用 Claude Agent SDK 创建新的 V2 Session
- **AND** 将 Session 存储在内存映射中，以 conversationId 为键

#### Scenario: 复用现有会话
- **WHEN** 用户向已有活跃会话的对话发送消息
- **THEN** 服务端 SHALL 复用现有的 V2 Session
- **AND** 避免重新初始化造成的冷启动延迟

#### Scenario: 会话健康检查
- **WHEN** V2 Session 的底层进程退出或传输层断开
- **THEN** 服务端 SHALL 检测到会话失效
- **AND** 自动清理失效的 Session 记录
- **AND** 下次请求时创建新的 Session

#### Scenario: 会话超时清理
- **WHEN** V2 Session 超过 30 分钟未被使用
- **THEN** 服务端 SHALL 自动关闭该 Session
- **AND** 释放相关资源

### Requirement: 流式消息处理
服务端 SHALL 处理 Claude Agent SDK 的流式响应，并转换为前端可消费的事件。

#### Scenario: Token 级文本流
- **WHEN** SDK 返回 text_delta 事件
- **THEN** 服务端 SHALL 累积文本内容
- **AND** 通过 WebSocket 推送 `agent:message` 事件（增量更新）

#### Scenario: 思考过程流
- **WHEN** SDK 返回 thinking 或 thinking_delta 事件
- **THEN** 服务端 SHALL 创建或更新 Thought 对象
- **AND** 通过 WebSocket 推送 `agent:thought` 或 `agent:thought-delta` 事件

#### Scenario: 工具调用处理
- **WHEN** SDK 返回 tool_use 块
- **THEN** 服务端 SHALL 创建 ToolCall 记录
- **AND** 推送 `agent:tool-call` 事件
- **AND** 等待工具执行结果

#### Scenario: 工具结果处理
- **WHEN** 工具执行完成并返回结果
- **THEN** 服务端 SHALL 更新对应的 ToolCall 记录
- **AND** 推送 `agent:tool-result` 事件

#### Scenario: 流完成处理
- **WHEN** SDK 流正常结束并返回 result 消息
- **THEN** 服务端 SHALL 推送 `agent:complete` 事件
- **AND** 保存最终消息内容到数据库
- **AND** 保存 Session ID 用于后续复用

### Requirement: 错误处理
服务端 SHALL 优雅处理 SDK 错误并通知前端。

#### Scenario: SDK 错误
- **WHEN** SDK 返回 error 类型的消息
- **THEN** 服务端 SHALL 推送 `agent:error` 事件
- **AND** 包含错误类型和详细消息

#### Scenario: 流中断检测
- **WHEN** SDK 流异常结束且未收到 result 消息
- **THEN** 服务端 SHALL 标记为中断状态
- **AND** 推送包含中断标志的 `agent:complete` 事件

#### Scenario: 用户中断
- **WHEN** 用户调用停止生成 API
- **THEN** 服务端 SHALL 触发 AbortController
- **AND** 中断 SDK 流处理

### Requirement: 消息持久化
服务端 SHALL 将对话消息持久化到数据库。

#### Scenario: 保存用户消息
- **WHEN** 收到用户发送的消息请求
- **THEN** 服务端 SHALL 将用户消息保存到数据库
- **AND** 包含消息内容、图片附件、时间戳

#### Scenario: 保存助手消息
- **WHEN** AI 流处理完成
- **THEN** 服务端 SHALL 将助手回复保存到数据库
- **AND** 包含最终内容、thoughts、token 使用量

### Requirement: API 凭证管理
服务端 SHALL 管理 AI 提供商的 API 凭证。

#### Scenario: 凭证读取
- **WHEN** 需要调用 AI 服务时
- **THEN** 服务端 SHALL 从配置文件读取 API 凭证
- **AND** 支持 Anthropic、OpenAI 兼容提供商

#### Scenario: 凭证解析
- **WHEN** 使用 OpenAI 兼容提供商
- **THEN** 服务端 SHALL 正确解析 baseUrl、apiKey、model
- **AND** 配置 SDK 使用兼容路由
