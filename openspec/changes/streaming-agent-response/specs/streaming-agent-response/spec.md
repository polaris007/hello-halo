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
  event: <event-name>
  data: <JSON-payload>

  ```
- **AND** event-name 与 data.type 的映射关系如下：

| SSE event-name | data.type | 说明 |
|----------------|-----------|------|
| `message` | `agent:message` | 文本消息（完整或增量） |
| `thought` | `agent:thought` | 新思考条目 |
| `thought-delta` | `agent:thought-delta` | 思考内容增量更新 |
| `tool-call` | `agent:tool-call` | 工具调用开始 |
| `tool-result` | `agent:tool-result` | 工具执行结果 |
| `compact` | `agent:compact` | 上下文压缩通知 |
| `complete` | `agent:complete` | 流处理完成 |
| `error` | `agent:error` | 错误信息 |

- **AND** data 始终包含 `spaceId` 和 `conversationId` 字段

#### Scenario: 消息文本流式推送
- **WHEN** Agent 生成文本内容（text_delta）
- **THEN** 系统推送 `event: message` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:message",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "content": "当前累计文本",
    "delta": "增量文本（可选，仅在增量推送时存在）",
    "isStreaming": true,
    "isComplete": false,
    "isNewTextBlock": false
  }
  ```
- **AND** 当新文本块开始时（content_block_start），`isNewTextBlock: true`，`content: ""`

#### Scenario: 思考过程推送
- **WHEN** Agent 执行思考过程（thinking）
- **THEN** 系统推送 `event: thought` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:thought",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "thought": {
      "id": "thought-xxx",
      "type": "thinking",
      "content": "思考内容",
      "isStreaming": true
    }
  }
  ```

#### Scenario: 思考过程增量更新
- **WHEN** 思考过程有增量内容（thinking_delta 或 tool input JSON delta）
- **THEN** 系统推送 `event: thought-delta` 事件
- **AND** 对于 thinking delta，数据包含：
  ```json
  {
    "type": "agent:thought-delta",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "thoughtId": "thought-xxx",
    "delta": "增量思考内容",
    "content": "累计完整内容（用于前端 fallback）",
    "isComplete": false
  }
  ```
- **AND** 对于 tool input JSON delta，数据包含：
  ```json
  {
    "type": "agent:thought-delta",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "thoughtId": "thought-xxx",
    "delta": "{\"partial\": \"json\"",
    "isToolInput": true,
    "isComplete": false
  }
  ```
- **AND** 当思考/工具输入完成时，`isComplete: true`

#### Scenario: 工具调用推送
- **WHEN** Agent 调用工具（tool_use）
- **THEN** 系统推送 `event: tool-call` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:tool-call",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "toolCall": {
      "id": "tool-xxx",
      "name": "Read",
      "status": "running",
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
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "toolId": "tool-xxx",
    "result": "工具执行结果",
    "isError": false
  }
  ```

#### Scenario: 上下文压缩推送
- **WHEN** Agent 执行上下文压缩（context compaction）
- **THEN** 系统推送 `event: compact` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:compact",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "trigger": "auto",
    "preTokens": 50000
  }
  ```
- **AND** `trigger` 字段说明压缩触发方式：
  - `auto` - SDK 自动触发压缩
  - `manual` - 用户手动触发压缩
- **AND** `preTokens` 表示压缩前的 token 数量

#### Scenario: 流完成推送
- **WHEN** Agent 处理完成
- **THEN** 系统推送 `event: complete` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:complete",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
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
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "error": "错误信息",
    "errorType": "<error-type>",
    "errorCode": "PROVIDER_ERROR_CODE"
  }
  ```
- **AND** errorType 与触发条件的对应关系：

| errorType | 触发条件 | 前端提示建议 |
|-----------|---------|-------------|
| `rate_limit` | API 返回速率限制错误（errorCode 包含 rate/limit） | "请求过于频繁，请稍后重试" |
| `auth_failure` | API Key 无效或过期（errorCode 包含 auth/api_key） | "认证失败，请检查 API Key" |
| `interrupted` | 用户取消或网络中断 | "响应已中断" 或 "已停止" |
| `max_turns` | 达到 SDK maxTurns 限制 | "已达最大轮次限制，可发送消息继续" |
| `unknown` | 其他未知错误 | 显示原始错误信息 |

- **AND** SSE 连接关闭

### Requirement: SSE 连接管理
系统 SHALL 正确管理 SSE 连接的生命周期，包括认证、断开检测和资源清理。

#### Scenario: 认证验证
- **WHEN** 用户请求 SSE 流式响应
- **THEN** 系统验证 Authorization 头中的 Bearer Token
- **AND** 若 Token 无效，返回 401 错误（非 SSE 格式）

#### Scenario: 连接断开检测
- **WHEN** 客户端断开 SSE 连接（关闭标签页、网络断开等）
- **THEN** 系统通过 `req.on('close')` 检测到连接断开
- **AND** 从 `activeSSEStreams` 映射中获取对应的 AbortController
- **AND** 调用 `abortController.abort()` 取消 Agent 任务
- **AND** 清理映射中的条目

#### Scenario: 请求取消
- **WHEN** 用户通过 `POST /api/v1/agent/stop` 取消生成
- **THEN** 系统从 `activeSSEStreams` 获取对应 conversationId 的 AbortController
- **AND** 调用 `abortController.abort()`
- **AND** 流处理器推送 `event: error` 事件，内容为 "Stopped by user"
- **AND** 关闭 SSE 连接

#### Scenario: SSE 流映射管理
- **WHEN** 新 SSE 流开始
- **THEN** 系统创建新的 AbortController
- **AND** 将 `conversationId -> AbortController` 映射存入 `activeSSEStreams`
- **WHEN** SSE 流结束（完成、错误、取消、断开）
- **THEN** 系统从 `activeSSEStreams` 中删除对应条目

### Requirement: 前端 SSE 消费
前端 SHALL 使用 fetch + ReadableStream 消费 SSE 流式响应。

#### Scenario: 发送消息并消费流
- **WHEN** 前端发送消息请求
- **THEN** 使用 `fetch()` 发送 POST 请求
- **AND** 设置 `Authorization: Bearer <token>` 头
- **AND** 通过 `response.body.getReader()` 获取 ReadableStream
- **AND** 循环读取并解析 SSE 事件

#### Scenario: SSE 事件解析
- **WHEN** 前端接收到 SSE 数据块
- **THEN** 解析 `event:` 行获取事件名称
- **AND** 解析 `data:` 行获取 JSON 数据
- **AND** 事件以双换行 `\n\n` 分隔
- **AND** 根据事件名称更新 UI 状态

#### Scenario: 更新消息内容
- **WHEN** 前端收到 `event: message` 事件
- **THEN** 若 `isNewTextBlock: true`，清空当前消息内容区域
- **AND** 若 `delta` 存在，追加增量文本
- **AND** 若 `content` 存在，可直接替换（fallback 模式）
- **AND** 如果 `isStreaming: true`，显示加载动画

#### Scenario: 更新思考过程
- **WHEN** 前端收到 `event: thought` 事件
- **THEN** 在思考过程区域添加新的思考条目
- **WHEN** 前端收到 `event: thought-delta` 事件
- **THEN** 根据 `thoughtId` 更新对应思考条目的内容
- **AND** 若 `isToolInput: true`，更新工具输入参数显示
- **AND** 若 `isComplete: true`，标记该条目为完成状态

#### Scenario: 处理完成
- **WHEN** 前端收到 `event: complete` 事件
- **THEN** 停止加载状态
- **AND** 保存最终消息到对话历史
- **AND** 更新 Token 使用统计

#### Scenario: 处理上下文压缩
- **WHEN** 前端收到 `event: compact` 事件
- **THEN** 显示上下文压缩通知（可选）
- **AND** 若 `trigger: auto`，显示"上下文已自动压缩"
- **AND** 若 `trigger: manual`，显示"上下文已手动压缩"
- **AND** 可选显示压缩前后的 token 数量变化

#### Scenario: 处理错误
- **WHEN** 前端收到 `event: error` 事件
- **THEN** 根据 `errorType` 显示不同的错误提示
- **AND** 对于 `rate_limit`，提示"请求过于频繁，请稍后重试"
- **AND** 对于 `auth_failure`，提示"认证失败，请检查 API Key"
- **AND** 对于 `interrupted`，提示"响应已中断"或"已停止"
- **AND** 对于 `max_turns`，提示"已达最大轮次限制，可发送消息继续"
- **AND** 对于 `unknown`，显示原始 `error` 字段内容
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