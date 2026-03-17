# AI Interaction Logging

## Purpose

记录所有与大模型（Claude等）交互的请求和响应内容，用于调试和优化AI交互。

## Requirements

### Requirement: AI交互日志记录
系统 SHALL 记录所有与大模型（Claude等）交互的请求和响应内容，用于调试和优化AI交互。

#### Scenario: AI请求日志记录
- **WHEN** 系统向大模型发送请求时
- **THEN** 系统记录以下信息：
  - 时间戳（ISO格式）
  - 模型名称（如"claude-3-5-sonnet-20241022"）
  - 请求的prompt内容
  - 请求参数（temperature、max_tokens等）
  - 请求的完整消息历史（如果可用）
- **AND** 日志写入`<日志目录>/ai-YYYY-MM-DD.log`文件

#### Scenario: AI响应日志记录
- **WHEN** 系统收到大模型的响应时
- **THEN** 系统记录以下信息：
  - 时间戳（ISO格式）
  - 响应内容
  - 响应时长（毫秒）
  - 使用的token数量（输入/输出）
  - 错误信息（如果有）
- **AND** 日志写入`<日志目录>/ai-YYYY-MM-DD.log`文件

#### Scenario: AI流式响应日志记录
- **WHEN** 系统收到大模型的流式响应时
- **THEN** 系统记录：
  - 每个chunk的接收时间戳
  - chunk内容
  - chunk类型（text_delta、thinking_delta等）
- **AND** 在响应完成后记录完整的响应内容

#### Scenario: AI交互日志格式
- **WHEN** 记录AI交互
- **THEN** 系统使用结构化JSON格式记录，包含以下字段：
```json
{
  "type": "ai_request" | "ai_response" | "ai_error",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "model": "claude-3-5-sonnet-20241022",
  "request_id": "uuid-string",
  "prompt": "完整或截断的prompt内容",
  "response": "完整或截断的响应内容",
  "parameters": {
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "tokens": {
    "input": 123,
    "output": 456
  },
  "duration": 1234,
  "error": null
}
```

#### Scenario: 敏感信息处理
- **WHEN** prompt或响应包含敏感信息
- **THEN** 系统自动检测并脱敏以下内容：
  - API密钥（如以`sk-`开头的字符串）
  - 密码（如字段名包含`password`、`secret`、`token`）
  - 个人身份信息（如邮箱、手机号模式匹配）
- **AND** 脱敏后的内容用`[REDACTED]`标记

#### Scenario: 大内容截断
- **WHEN** prompt内容超过10KB
- **THEN** 系统只记录前2048个字符并在日志中添加`[TRUNCATED]`标记
- **WHEN** 响应内容超过10KB
- **THEN** 系统只记录前2048个字符并在日志中添加`[TRUNCATED]`标记

#### Scenario: AI错误日志记录
- **WHEN** AI请求失败时（网络错误、API错误、超时等）
- **THEN** 系统记录详细的错误信息：
  - 错误类型
  - 错误消息
  - 错误堆栈（如果可用）
  - 重试次数
- **AND** 标记为`ai_error`类型

#### Scenario: 配置控制
- **WHEN** 设置了环境变量`HALO_LOG_AI_DETAIL=false`
- **THEN** 系统不记录AI交互的详细内容
- **AND** 只记录基本信息（时间戳、模型、请求ID、时长、token数量）
- **WHEN** 设置了环境变量`HALO_LOG_AI_MAX_SIZE=512`
- **THEN** 系统截断prompt和响应的记录大小为512字符

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