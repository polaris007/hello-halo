## 1. 扩展 AI Logger 模块

- [ ] 1.1 在 `src/server/utils/ai-logger.ts` 中新增 `UserMessageLog` 接口定义
- [ ] 1.2 在 `src/server/utils/ai-logger.ts` 中新增 `AiConfigLog` 接口定义
- [ ] 1.3 在 `src/server/utils/ai-logger.ts` 中新增 `AiConfigErrorLog` 接口定义
- [ ] 1.4 实现 `logUserMessage()` 函数，记录用户消息
- [ ] 1.5 实现 `logAiConfig()` 函数，记录 AI 配置获取
- [ ] 1.6 实现 `logAiConfigError()` 函数，记录 AI 配置获取失败
- [ ] 1.7 更新 `generateRequestId()` 函数，支持外部传入 requestId 以保持一致性

## 2. 集成日志记录到消息发送流程

- [ ] 2.1 在 `src/server/services/agent/send-message.ts` 的 `sendMessage()` 函数入口处添加用户消息日志记录
- [ ] 2.2 在 `getApiCredentials()` 调用成功后添加 AI 配置日志记录
- [ ] 2.3 在 `getApiCredentials()` 调用失败时添加 AI 配置错误日志记录
- [ ] 2.4 确保 `requestId` 在整个调用链路中传递（user_message → ai_config → ai_request → ai_response）

## 3. 统一日志目录

- [ ] 3.1 修改 `src/server/utils/logger.ts` 的 `getLogDirectory()` 函数，默认使用 `{cwd}/logs/` 而非 `{data-dir}/logs/`
- [ ] 3.2 确保 `HALO_LOG_DIR` 环境变量仍可覆盖日志目录

## 4. 测试与验证

- [ ] 4.1 手动测试：发送消息后检查 `logs/ai-YYYY-MM-DD.log` 文件是否包含完整的调用链路日志
- [ ] 4.2 验证日志格式符合 spec 定义
- [ ] 4.3 验证敏感信息已正确脱敏（API Key 不应完整记录）
- [ ] 4.4 验证 `HALO_LOG_AI_DETAIL=false` 环境变量可关闭详细日志
- [ ] 4.5 验证 `server-YYYY-MM-DD.log` 文件写入 `{cwd}/logs/` 目录
- [ ] 4.6 验证 `api-YYYY-MM-DD.log` 和 `ai-YYYY-MM-DD.log` 与 `server-YYYY-MM-DD.log` 在同一目录
