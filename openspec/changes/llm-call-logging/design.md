## Context

当前系统已有 `ai-logger.ts` 模块用于记录 AI 交互日志，记录以下内容：
- `ai_request` - 发送给 AI 的请求
- `ai_response` - AI 返回的响应
- `ai_stream_chunk` - 流式响应的每个 chunk

但缺少完整调用链路的前置环节：
1. 用户消息接收（会话入口）
2. AI 配置获取（获取到什么配置）

现有 `send-message.ts` 中有一些 `console.log` 调试日志，但不是结构化的日志记录。

**日志目录不统一问题**：
- `server-xxxx.log` 写入 `{data-dir}/logs/` 目录（通过 `getConfig().data.basePath` 获取）
- `api-xxxx.log` 写入 `{cwd}/logs/` 目录
- `ai-xxxx.log` 写入 `{cwd}/logs/` 目录（`ai-logger.ts` 使用 `process.cwd()`）

这导致日志文件分散在两个不同位置，不便于统一管理和 Docker 部署时的日志收集。

## Goals / Non-Goals

**Goals:**
- 记录用户发送的聊天消息内容，包含会话ID、消息内容、用户信息
- 记录获取到的 AI 提供商配置，包含提供商类型、模型名称、API URL（不记录敏感信息如 API Key）
- 通过 `conversationId` 和 `requestId` 将整个调用链路串联起来
- 复用现有的 `ai-logger.ts` 模块和日志文件格式
- 统一日志目录，将所有日志文件放在 `{cwd}/logs/` 目录

**Non-Goals:**
- 不修改现有日志文件路径和格式
- 不新增日志文件
- 不改变现有 API 行为

## Decisions

### 决策 1: 复用现有 ai-logger.ts 模块

**选择**: 扩展现有 `ai-logger.ts` 模块，新增两种日志类型

**理由**:
- 现有模块已有完善的日志基础设施（文件写入、清理、脱敏）
- 日志已统一写入 `ai-YYYY-MM-DD.log` 文件
- 避免引入新的日志模块，减少维护成本

**替代方案**: 创建独立的会话日志模块
- 否决原因：增加维护成本，日志分散不利于排查

### 决策 2: 新增日志类型设计

新增两种日志类型，统一使用 JSON 结构化格式：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  user_message   │ ──► │   ai_config     │ ──► │   ai_request    │ ──► │   ai_response   │
│  (用户消息)      │     │  (AI配置获取)    │     │  (发送给AI)     │     │  (AI响应)       │
└─────────────────┘     └─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │                       │
        └───────────────────────┴───────────────────────┴───────────────────────┘
                                通过 conversationId 关联
```

### 决策 3: 日志记录位置

| 日志类型 | 记录位置 | 文件 |
|---------|---------|------|
| `user_message` | `sendMessage()` 入口，获取 credentials 之前 | `send-message.ts` |
| `ai_config` | `getApiCredentials()` 返回后 | `send-message.ts` |
| `ai_request` | SDK 调用前（现有逻辑增强） | `stream-processor.ts` |
| `ai_response` | SDK 响应后（现有逻辑增强） | `stream-processor.ts` |

### 决策 4: 敏感信息处理

遵循现有 `sanitizeAiRequest()` 函数的脱敏策略：
- API Key：仅记录前10个字符 + `...`
- 敏感字段（password, secret, token 等）：替换为 `[REDACTED]`

### 决策 4: 统一日志目录

**选择**: 将所有日志文件统一放在 `{cwd}/logs/` 目录

**理由**:
- 简化日志管理，所有日志文件在同一位置
- Docker 部署时只需挂载一个日志目录
- 与现有的 `api-xxxx.log` 和 `ai-xxxx.log` 保持一致

**替代方案**: 将所有日志放到 `{data-dir}/logs/`
- 否决原因：`data-dir` 可能是用户数据目录，日志更适合放在应用运行目录

**实现方式**:
- 修改 `logger.ts` 的 `getLogDirectory()` 函数，默认使用 `{cwd}/logs/` 而非 `{data-dir}/logs/`
- 保留 `HALO_LOG_DIR` 环境变量覆盖能力

## Risks / Trade-offs

**风险 1: 日志量增加**
- 影响：每个会话新增 2 条日志记录
- 缓解：日志已有截断机制，超长内容会被截断；可通过环境变量关闭详细日志

**风险 2: 性能影响**
- 影响：日志写入为同步操作，可能轻微影响响应时间
- 缓解：日志量小（JSON 结构化），影响可忽略；已有异步写入优化空间

**风险 3: 敏感信息泄露**
- 影响：用户消息可能包含敏感信息
- 缓解：沿用现有脱敏机制；日志文件权限控制；支持关闭详细日志

**风险 4: 日志目录变更影响**
- 影响：已有部署可能依赖旧的日志路径 `{data-dir}/logs/`
- 缓解：通过 `HALO_LOG_DIR` 环境变量可指定任意日志目录
