## ADDED Requirements

### Requirement: 用户消息接收日志记录
系统 SHALL 在接收用户发送的聊天消息时记录日志，作为 AI 交互链路的起点。

#### Scenario: 用户消息日志记录
- **WHEN** 用户通过会话发送消息时
- **THEN** 系统记录以下信息：
  - 时间戳（ISO格式）
  - 会话ID（conversationId）
  - 空间ID（spaceId）
  - 用户ID（userId，如适用）
  - 消息内容（文本）
  - 附件信息（图片数量，如有）
- **AND** 日志写入`<日志目录>/ai-YYYY-MM-DD.log`文件
- **AND** 日志类型为 `user_message`

#### Scenario: 用户消息日志格式
- **WHEN** 记录用户消息
- **THEN** 系统使用结构化JSON格式记录，包含以下字段：
```json
{
  "type": "user_message",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "conversationId": "uuid-string",
  "spaceId": "uuid-string",
  "userId": "uuid-string",
  "message": {
    "content": "用户消息内容",
    "images": 0
  },
  "requestId": "ai-xxx-xxx"
}
```

#### Scenario: 用户消息敏感信息处理
- **WHEN** 用户消息包含敏感信息
- **THEN** 系统自动检测并脱敏以下内容：
  - API密钥（如以`sk-`开头的字符串）
  - 密码（如字段名包含`password`、`secret`、`token`）
- **AND** 脱敏后的内容用`[REDACTED]`标记

#### Scenario: 用户消息内容截断
- **WHEN** 用户消息内容超过10KB
- **THEN** 系统只记录前2048个字符并在日志中添加`[TRUNCATED]`标记

### Requirement: AI配置获取日志记录
系统 SHALL 在获取AI提供商配置时记录日志，记录实际使用的配置信息。

#### Scenario: AI配置日志记录
- **WHEN** 系统获取AI提供商配置成功时
- **THEN** 系统记录以下信息：
  - 时间戳（ISO格式）
  - 会话ID（conversationId）
  - 提供商类型（provider：anthropic/openai/custom）
  - 模型名称（model）
  - API基础URL（baseUrl，如适用）
  - 自定义请求头（customHeaders，如适用）
- **AND** 不记录敏感信息（API Key、访问令牌）
- **AND** 日志写入`<日志目录>/ai-YYYY-MM-DD.log`文件
- **AND** 日志类型为 `ai_config`

#### Scenario: AI配置日志格式
- **WHEN** 记录AI配置
- **THEN** 系统使用结构化JSON格式记录，包含以下字段：
```json
{
  "type": "ai_config",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "conversationId": "uuid-string",
  "config": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022",
    "displayModel": "claude-3-5-sonnet-20241022",
    "baseUrl": "https://api.anthropic.com",
    "apiType": "default",
    "customHeaders": null,
    "forceStream": false,
    "filterContent": false
  },
  "requestId": "ai-xxx-xxx"
}
```

#### Scenario: AI配置敏感信息保护
- **WHEN** 记录AI配置
- **THEN** 系统不记录以下敏感字段：
  - apiKey（仅记录是否存在，不记录值）
  - accessToken
  - 任何包含`secret`、`password`、`token`的字段

#### Scenario: AI配置获取失败日志
- **WHEN** 系统获取AI配置失败时
- **THEN** 系统记录错误日志：
  - 时间戳
  - 会话ID
  - 错误类型
  - 错误消息
- **AND** 日志类型为 `ai_config_error`

### Requirement: 日志关联性
系统 SHALL 通过唯一标识符将整个AI调用链路的日志记录关联起来。

#### Scenario: 请求ID生成与传递
- **WHEN** 用户发送消息开始新的AI调用
- **THEN** 系统生成唯一的 `requestId`（格式：`ai-{timestamp}-{random}`）
- **AND** 该 `requestId` 在整个调用链路中保持一致：
  - `user_message` 日志
  - `ai_config` 日志
  - `ai_request` 日志
  - `ai_response` 日志

#### Scenario: 会话ID关联
- **WHEN** 记录任何AI交互相关日志
- **THEN** 系统包含 `conversationId` 字段
- **AND** 可通过 `conversationId` 查询完整的调用链路
