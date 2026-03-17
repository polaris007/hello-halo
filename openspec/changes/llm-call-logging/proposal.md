## Why

当前系统缺乏对 LLM 调用完整链路的日志记录。现有 `ai-interaction-logging` 只记录 AI API 层面的请求和响应，但缺少：
- 用户发送的消息内容（会话入口）
- 获取到的 AI 提供商配置信息

在调试和排查问题时，无法追踪完整的调用链路：用户消息 → AI 配置获取 → 发送给 AI → AI 响应。这导致排查 AI 调用问题时缺少关键上下文。

## What Changes

扩展现有的 AI 交互日志功能，记录完整的 LLM 调用链路：

- **新增会话消息接收日志**：记录用户发送的聊天消息内容（会话ID、消息内容、用户信息）
- **新增 AI 配置获取日志**：记录获取到的 AI 提供商配置（提供商类型、模型名称、API URL，不记录敏感信息如 API Key）
- **关联现有 AI 请求/响应日志**：通过 `conversation_id` 和 `request_id` 将整个调用链路串联起来

统一日志目录位置：

- **修改 server 日志目录**：将 `server-xxxx.log` 从 `{data-dir}/logs/` 移动到 `{cwd}/logs/` 目录，与 `api-xxxx.log` 和 `ai-xxxx.log` 放在同一目录

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `ai-interaction-logging`: 扩展日志记录范围，增加会话消息接收和 AI 配置获取的日志场景
- `structured-file-logging`: 修改 server 日志目录，从 `{data-dir}/logs/` 改为 `{cwd}/logs/`

## Impact

- **代码影响**：修改会话消息处理逻辑、AI 配置获取逻辑，添加日志记录点；修改 server logger 的默认日志目录
- **日志文件**：
  - `server-YYYY-MM-DD.log` 从 `{data-dir}/logs/` 移动到 `{cwd}/logs/`
  - 所有日志文件统一放在 `{cwd}/logs/` 目录（包括 server、api、ai 日志）
- **性能影响**：增加少量日志写入，对性能影响可忽略
- **向后兼容**：
  - 环境变量 `HALO_LOG_DIR` 仍可覆盖日志目录
  - 现有 API 行为不变
- **部署影响**：Docker 部署时只需挂载一个日志目录 `{cwd}/logs/`
