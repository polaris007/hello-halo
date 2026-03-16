## 1. 时间戳格式修改

- [x] 1.1 修改 `src/server/utils/logger.ts` 中的 `formatTimestamp()` 函数，使用本地系统时间替代 UTC 时间
- [x] 1.2 验证 server 日志输出格式为 `[YYYY-MM-DDTHH:mm:ss.SSS] [LEVEL] message`

## 2. API 日志格式修改

- [x] 2.1 修改 `src/server/middleware/request-logger.middleware.ts`，将日志格式从 JSON 改为结构化文本
- [x] 2.2 实现日志格式：`[YYYY-MM-DDTHH:mm:ss.SSS] [INFO] HTTP 请求: {method} {url} - {statusCode} - {duration}ms - {clientIp}`
- [x] 2.3 详细信息（请求头、请求体、响应体）在单独行记录

## 3. 测试更新

- [x] 3.1 更新 `tests/unit/server/logger.test.ts` 以验证本地时间格式
- [x] 3.2 运行所有相关测试确保功能正常

## 4. 规范文档更新

- [x] 4.1 同步更新 `openspec/specs/structured-file-logging/spec.md` 主规范文件
- [x] 4.2 同步更新 `openspec/specs/request-response-logging/spec.md` 主规范文件
