# Streaming Agent Response

## Purpose

提供 SSE（Server-Sent Events）流式响应能力，将 Claude Agent SDK 的消息流转换为 HTTP SSE 格式实时推送给前端。

## ADDED Requirements

### Requirement: SSE 流式消息响应
系统 SHALL 通过 SSE 流式响应返回 Agent 消息处理过程，包括 thinking、tool_use、text 等事件。

#### Scenario: 发送消息返回 SSE 流
- **WHEN** 用户通过 `POST /api/v1/agent/message` 发送消息
- **THEN** 系统返回 `Content-Type: text/event-stream` 的 SSE 流
- **AND** 流中实时推送 Agent 处理事件

#### Scenario: SSE 事件格式
- **WHEN** 系统推送 Agent 事件
- **THEN** 每个事件使用标准 SSE 格式：
  ```
  event: <event-type>
  data: <JSON-payload>

  ```
- **AND** event-type 包括：`message`、`thought`、`thought-delta`、`tool-call`、`tool-result`、`complete`、`error`

#### Scenario: 消息文本流式推送
- **WHEN** Agent 生成文本内容（text_delta）
- **THEN** 系统推送 `event: message` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:message",
    "content": "当前累计文本",
    "delta": "增量文本",
    "isStreaming": true,
    "isComplete": false
  }
  ```

#### Scenario: 思考过程推送
- **WHEN** Agent 执行思考过程（thinking）
- **THEN** 系统推送 `event: thought` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:thought",
    "thought": {
      "id": "thought-xxx",
      "type": "thinking",
      "content": "思考内容",
      "isStreaming": true
    }
  }
  ```

#### Scenario: 工具调用推送
- **WHEN** Agent 调用工具（tool_use）
- **THEN** 系统推送 `event: tool-call` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:tool-call",
    "toolCall": {
      "id": "tool-xxx",
      "name": "Read",
      "input": { "file_path": "/path/to/file" }
    }
  }
  ```

#### Scenario: 工具结果推送
- **WHEN** 工具执行完成
- **THEN** 系统推送 `event: tool-result` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:tool-result",
    "toolId": "tool-xxx",
    "result": "工具执行结果",
    "isError": false
  }
  ```

#### Scenario: 流完成推送
- **WHEN** Agent 处理完成
- **THEN** 系统推送 `event: complete` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:complete",
    "tokenUsage": {
      "inputTokens": 123,
      "outputTokens": 456
    }
  }
  ```
- **AND** SSE 连接关闭

#### Scenario: 错误推送
- **WHEN** Agent 处理过程中发生错误
- **THEN** 系统推送 `event: error` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:error",
    "error": "错误信息",
    "errorType": "rate_limit | auth_failure | unknown"
  }
  ```
- **AND** SSE 连接关闭

### Requirement: SSE 连接管理
系统 SHALL 正确管理 SSE 连接的生命周期，包括认证、断开检测和资源清理。

#### Scenario: 认证验证
- **WHEN** 用户请求 SSE 流式响应
- **THEN** 系统验证 Authorization 头中的 Bearer Token
- **AND** 若 Token 无效，返回 401 错误（非 SSE 格式）

#### Scenario: 连接断开检测
- **WHEN** 客户端断开 SSE 连接
- **THEN** 系统检测到连接断开
- **AND** 取消正在进行的 Agent 任务
- **AND** 清理相关资源（AbortController）

#### Scenario: 请求取消
- **WHEN** 用户通过 `POST /api/v1/agent/stop` 取消生成
- **THEN** 系统停止 Agent 处理
- **AND** 推送 `event: error` 事件，内容为 "Stopped by user"
- **AND** 关闭 SSE 连接

### Requirement: 前端 SSE 消费
前端 SHALL 使用 fetch + ReadableStream 消费 SSE 流式响应。

#### Scenario: 发送消息并消费流
- **WHEN** 前端发送消息请求
- **THEN** 使用 `fetch()` 发送 POST 请求
- **AND** 通过 `response.body.getReader()` 获取 ReadableStream
- **AND** 循环读取并解析 SSE 事件

#### Scenario: SSE 事件解析
- **WHEN** 前端接收到 SSE 数据块
- **THEN** 解析 `event:` 行获取事件类型
- **AND** 解析 `data:` 行获取 JSON 数据
- **AND** 根据事件类型更新 UI 状态

#### Scenario: 更新消息内容
- **WHEN** 前端收到 `event: message` 事件
- **THEN** 更新当前消息的内容区域
- **AND** 如果 `isStreaming: true`，显示加载动画

#### Scenario: 更新思考过程
- **WHEN** 前端收到 `event: thought` 事件
- **THEN** 在思考过程区域添加或更新思考条目

#### Scenario: 处理完成
- **WHEN** 前端收到 `event: complete` 事件
- **THEN** 停止加载状态
- **AND** 保存最终消息到对话历史
- **AND** 更新 Token 使用统计

#### Scenario: 处理错误
- **WHEN** 前端收到 `event: error` 事件
- **THEN** 显示错误提示
- **AND** 停止加载状态

### Requirement: AI 日志记录集成
SSE 流式响应 SHALL 与现有 AI 日志记录系统集成，确保所有请求和响应被记录。

#### Scenario: 请求日志记录
- **WHEN** 用户发送消息触发 SSE 流
- **THEN** 系统按照 `ai-interaction-logging` 规范记录 `user_message` 日志
- **AND** 记录 `ai_config` 日志
- **AND** 记录 `ai_request` 日志

#### Scenario: 响应日志记录
- **WHEN** SSE 流完成
- **THEN** 系统按照 `ai-interaction-logging` 规范记录 `ai_response` 日志
- **AND** 包含完整的 token 使用统计

#### Scenario: 流式块日志记录
- **WHEN** SSE 流推送事件时
- **THEN** 系统可选地记录 `ai_stream_chunk` 日志（采样或关键事件）
