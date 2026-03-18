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
| `ask-question` | `agent:ask-question` | AI 向用户提问 |
| `waiting-for-input` | `agent:waiting-for-input` | 等待用户输入（审批/回答） |
| `complete` | `agent:complete` | 流处理完成 |
| `error` | `agent:error` | 错误信息 |

- **AND** data 始终包含 `spaceId` 和 `conversationId` 字段
- **AND** 前端应使用 `event` 字段判断事件类型，`data.type` 用于调试和日志

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
- **AND** `trigger` 字段值为 `auto`（SDK 自动触发压缩）
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

#### Scenario: AI 提问推送
- **WHEN** Agent 调用 AskUserQuestion 工具向用户提问
- **THEN** 系统推送 `event: ask-question` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:ask-question",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "id": "question-xxx",
    "questions": [
      {
        "key": "framework",
        "question": "使用哪个前端框架？",
        "header": "Framework",
        "options": [
          { "label": "React", "description": "组件化框架" },
          { "label": "Vue", "description": "渐进式框架" }
        ]
      }
    ]
  }
  ```
- **AND** 随后推送 `event: waiting-for-input` 事件（见下方）

#### Scenario: 等待用户输入推送
- **WHEN** Agent 需要等待用户输入（工具审批或回答问题）
- **THEN** 系统推送 `event: waiting-for-input` 事件
- **AND** 数据包含：
  ```json
  {
    "type": "agent:waiting-for-input",
    "spaceId": "space-xxx",
    "conversationId": "conv-xxx",
    "inputType": "<input-type>",
    "message": "等待用户操作"
  }
  ```
- **AND** `inputType` 与场景对应关系：

| inputType | 触发场景 | 额外字段 |
|-----------|---------|---------|
| `tool-approval` | 工具需要审批 | `toolCallId`, `toolName` |
| `question` | AI 提问（AskUserQuestion） | `questionId` |

- **AND** SSE 流保持打开，等待用户操作
- **WHEN** 用户通过独立 HTTP 端点提交操作后
- **THEN** SSE 流继续推送后续事件

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
| `rate_limit` | errorCode 包含 `rate` 或 `limit` | "请求过于频繁，请稍后重试" |
| `auth_failure` | errorCode 包含 `auth`、`api_key` 或 `invalid_key` | "认证失败，请检查 API Key" |
| `interrupted` | 用户取消或网络中断 | "响应已中断" 或 "已停止" |
| `max_turns` | 达到 SDK maxTurns 限制 | "已达最大轮次限制，可发送消息继续" |
| `unknown` | 其他未知错误 | 显示原始 `error` 字段内容 |

- **AND** 若无 errorCode，errorType 根据其他条件判断
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
- **AND** 从 `activeSSEStreams` 映射中获取对应的连接条目
- **AND** 调用连接条目中的 `controller.abort()` 取消 Agent 任务
- **AND** 清理映射中的条目（由 finally 块负责）

#### Scenario: 请求取消
- **WHEN** 用户通过 `POST /api/v1/agent/stop` 取消生成
- **THEN** 系统从 `activeSSEStreams` 获取对应 conversationId 的 AbortController
- **AND** 调用 `abortController.abort()`
- **AND** 流处理器推送 `event: error` 事件，内容为 "Stopped by user"
- **AND** 关闭 SSE 连接

#### Scenario: SSE 流映射管理
- **WHEN** 新 SSE 流开始
- **THEN** 系统创建新的 AbortController 和超时定时器
- **AND** 若该 conversationId 已有活跃连接，先取消旧连接
- **AND** 将 `conversationId -> { controller, timeoutId }` 映射存入 `activeSSEStreams`
- **WHEN** SSE 流结束（完成、错误、取消、断开）
- **THEN** 系统清理超时定时器并从 `activeSSEStreams` 中删除对应条目

#### Scenario: 连接超时清理
- **WHEN** SSE 连接持续时间超过 30 分钟
- **THEN** 系统自动取消该连接
- **AND** 从 `activeSSEStreams` 中删除对应条目

### Requirement: 前端 SSE 消费
前端 SHALL 使用 fetch + ReadableStream 消费 SSE 流式响应。

#### Scenario: 发送消息并消费流
- **WHEN** 前端发送消息请求
- **THEN** 使用 `fetch()` 发送 POST 请求
- **AND** 设置 `Authorization: Bearer <token>` 头
- **AND** 通过 `response.body.getReader()` 获取 ReadableStream
- **AND** 循环读取并解析 SSE 事件

#### Scenario: SSE 断开后不自动重连
- **WHEN** SSE 连接因网络中断或服务器关闭而断开
- **THEN** 前端不自动重连（SSE 是有状态的流，无法从中断点恢复）
- **AND** 前端显示"连接中断"或"响应已中断"提示
- **AND** 用户可查看已有的部分内容（通过 `GET /api/v1/conversations/:id` 获取）
- **AND** 用户可选择重新发送消息继续对话

#### Scenario: 部分内容恢复显示
- **WHEN** 用户打开对话，该对话有 `isPartial: true` 的 assistant message
- **THEN** 前端显示已生成的部分内容
- **AND** 前端显示提示"上次响应未完成，可发送消息继续"
- **AND** 用户发送新消息后，AI 将基于上下文继续处理

#### Scenario: SSE 事件解析
- **WHEN** 前端接收到 SSE 数据块
- **THEN** 解析 `event:` 行获取事件名称
- **AND** 解析 `data:` 行获取 JSON 数据
- **AND** 事件以双换行 `\n\n` 分隔
- **AND** 多行 data 字段直接拼接（无分隔符）
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
- **AND** 显示"上下文已自动压缩"
- **AND** 可选显示压缩前的 token 数量

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
- **THEN** 系统每 10 个 text_delta 事件记录一次 `ai_stream_chunk` 日志
- **AND** 所有 thinking_delta、input_json_delta 事件记录 `ai_stream_chunk` 日志

### Requirement: 增量持久化
系统 SHALL 在 SSE 流式生成过程中实时持久化部分内容，确保连接中断时用户不会丢失已生成的内容。

#### Scenario: 部分内容持久化
- **WHEN** SSE 流正在推送文本内容
- **THEN** 系统每 2 秒更新一次数据库中的 assistant message
- **AND** 更新内容包括当前累计的 `content` 和 `thoughts`
- **AND** 消息标记为 `isPartial: true`

#### Scenario: 完成时持久化
- **WHEN** SSE 流完成（收到 complete 事件或 error 事件)
- **THEN** 系统更新数据库中的 assistant message
- **AND** 消息标记为 `isPartial: false`
- **AND** 包含完整的 tokenUsage

#### Scenario: 连接中断后的内容恢复
- **WHEN** 用户重新打开对话或发送新消息
- **AND** 该对话有 `isPartial: true` 的 assistant message
- **THEN** 前端显示之前已生成的部分内容
- **AND** 用户可选择发送 "continue" 继续

### Requirement: 双向通信场景处理
系统 SHALL 正确处理需要用户输入的场景，包括工具审批和 AI 提问。

> **重要说明**：工具审批是**新功能开发**，当前系统使用 `permissionMode: 'bypassPermissions'` 跳过所有权限检查。
> 实现工具审批需要修改 SDK 配置并扩展 `createCanUseTool` 回调。

#### Scenario: 工具审批流程（新功能）
- **GIVEN** SDK 配置 `permissionMode: 'default'`（非 `bypassPermissions`）
- **AND** `createCanUseTool` 回调中定义了需要审批的工具列表
- **WHEN** Agent 调用需要审批的工具（如 Bash、Edit、Write、NotebookEdit）
- **THEN** SDK 调用 `canUseTool` 回调询问权限
- **AND** 系统推送 `event: tool-call` 事件，包含 `requiresApproval: true`
- **AND** 系统推送 `event: waiting-for-input` 事件，`inputType: "tool-approval"`
- **AND** SSE 流保持打开，等待用户操作
- **WHEN** 用户调用 `POST /api/v1/agent/approve`
- **THEN** `canUseTool` 回调返回 `{ behavior: 'allow' }`
- **AND** SDK 继续执行工具
- **AND** SSE 流继续推送后续事件
- **WHEN** 用户调用 `POST /api/v1/agent/reject`
- **THEN** `canUseTool` 回调返回 `{ behavior: 'deny' }`
- **AND** SDK 取消该工具调用
- **AND** SSE 流继续推送后续事件（或完成）

#### Scenario: AskUserQuestion 流程
- **WHEN** Agent 调用 AskUserQuestion 工具（SDK 内置工具）
- **THEN** SSE 流推送 `event: ask-question` 事件，包含问题列表
- **AND** SSE 流推送 `event: waiting-for-input` 事件， `inputType: "question"`
- **AND** SSE 流保持打开,等待用户回答
- **AND** WebSocket 同时收到相同事件（双通道架构）
- **WHEN** 用户调用 `POST /api/v1/agent/answer-question`
    **THEN** 系统继续 Agent 执行
    **AND** SSE 流继续推送后续事件

#### Scenario: 用户取消等待状态
- **WHEN** 用户点击"停止"按钮取消等待中的输入请求
- **THEN** 系统调用 `abortController.abort()`
- **AND** SSE 流推送 `event: error` 事件，`errorType: "interrupted"`
- **AND** SSE 连接关闭

### Requirement: SSE + WebSocket 双通道架构
系统 SHALL 采用 SSE + WebSocket 并存的双通道架构，SSE 处理对话特定事件，WebSocket 处理全局事件。

#### Scenario: 双通道事件路由
- **GIVEN** 前端同时维护 SSE 连接和 WebSocket 连接
- **WHEN** Agent 产生事件
- **THEN** 对话特定事件同时发送到 SSE 和 WebSocket（过渡期）
- **AND** 全局事件仅发送到 WebSocket

#### Scenario: 事件类型与通道映射
- **GIVEN** 系统采用双通道架构
- **THEN** 事件类型与传输通道的映射关系如下：

| 事件类型 | SSE 通道 | WebSocket 通道 | 说明 |
|---------|---------|----------------|------|
| `agent:message` | ✓ | ✓ | 对话事件，双通道 |
| `agent:thought` | ✓ | ✓ | 对话事件，双通道 |
| `agent:thought-delta` | ✓ | ✓ | 对话事件，双通道 |
| `agent:tool-call` | ✓ | ✓ | 对话事件，双通道 |
| `agent:tool-result` | ✓ | ✓ | 对话事件，双通道 |
| `agent:compact` | ✓ | ✓ | 对话事件，双通道 |
| `agent:ask-question` | ✓ | ✓ | 对话事件，双通道 |
| `agent:waiting-for-input` | ✓ | ✓ | 对话事件，双通道 |
| `agent:complete` | ✓ | ✓ | 对话事件，双通道 |
| `agent:error` | ✓ | ✓ | 对话事件，双通道 |
| `mcp:status` | ✗ | ✓ | 全局事件，仅 WebSocket |
| `file:change` | ✗ | ✓ | 全局事件，仅 WebSocket |
| `broadcastToAll` | ✗ | ✓ | 全局事件，仅 WebSocket |

#### Scenario: 前端双通道消费
- **GIVEN** 前端需要同时处理 SSE 和 WebSocket 事件
- **WHEN** 前端初始化
- **THEN** 建立 WebSocket 连接用于全局事件
- **WHEN** 用户发送消息
- **THEN** 建立 SSE 连接用于对话事件
- **AND** SSE 连接随对话结束而关闭
- **AND** WebSocket 连接保持打开

### Requirement: WebSocket 保留功能
系统 SHALL 保留 WebSocket 用于非 Agent 场景的事件推送。

#### Scenario: 文件变更通知
- **WHEN** 文件系统发生变更
- **THEN** 系统通过 WebSocket 推送 `file:change` 事件
- **AND** 事件包含 `action`（create/update/delete）和 `path`

#### Scenario: 全局广播
- **WHEN** 系统需要广播全局通知
- **THEN** 系统通过 WebSocket 的 `broadcastToAll` 推送事件

#### Scenario: MCP 状态变更
- **WHEN** MCP 服务器状态变更
- **THEN** 系统通过 WebSocket 广播 `mcp:status` 事件
- **AND** 所有已连接的客户端收到该事件

#### Scenario: Agent 事件双通道推送
- **WHEN** Agent 产生事件（message、thought、tool-call 等）
- **THEN** 系统通过 SSE 流推送（主要通道）
- **AND** 系统同时通过 WebSocket 推送（兼容通道，过渡期）

### Requirement: 数据库支持增量持久化
系统 SHALL 在消息 JSON 对象中支持 `isPartial` 字段，用于标记消息是否为部分内容。

#### Scenario: 消息 JSON 对象更新
- **WHEN** 实现增量持久化功能
- **THEN** Message 类型定义添加 `isPartial?: boolean` 字段
- **AND** 该字段存储在 conversations 表的 messages JSON 数组中的每条消息对象内部
- **AND** 无需数据库架构迁移

#### Scenario: 消息存储示例
- **GIVEN** 一条流式生成中的 assistant 消息
- **WHEN** 系统持久化该消息
- **THEN** messages JSON 数组中的消息对象包含：
  ```json
  {
    "id": "msg-xxx",
    "role": "assistant",
    "content": "已生成的部分文本...",
    "thoughts": [...],
    "isPartial": true,
    "timestamp": 1709123456789
  }
  ```

#### Scenario: 旧消息兼容
- **GIVEN** 历史对话中的消息（无 isPartial 字段）
- **WHEN** 前端读取对话历史
- **THEN** 视为 `isPartial: false`（完整消息）
