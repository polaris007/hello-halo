## Why

当前日志系统存在两个问题：
1. `api-xxxx.log` 使用 JSON 格式记录日志，不便于直接阅读和快速浏览
2. 日志时间戳使用 UTC 时间（`toISOString()`），与本地系统时间不一致，调试时不直观

需要统一日志格式并使用本地系统时间，提高日志的可读性和调试效率。

## What Changes

- **api-xxxx.log**: 从 JSON 格式改为结构化文本格式，与 server 日志格式对齐
- **时间格式**: 所有日志时间戳从 UTC 时间改为本地系统时间
- 日志格式统一为: `[YYYY-MM-DDTHH:mm:ss.SSS] [LEVEL] message`

## Capabilities

### New Capabilities

None

### Modified Capabilities

- `structured-file-logging`: 修改时间戳格式要求，从 UTC 时间改为本地系统时间
- `request-response-logging`: 修改日志格式要求，从 JSON 格式改为结构化文本格式，并使用本地时间

## Impact

- `src/server/utils/logger.ts` - 修改 `formatTimestamp()` 函数使用本地时间
- `src/server/middleware/request-logger.middleware.ts` - 修改日志格式为结构化文本格式
- `tests/unit/server/logger.test.ts` - 更新测试用例
- `openspec/specs/structured-file-logging/spec.md` - 更新时间戳格式规范
- `openspec/specs/request-response-logging/spec.md` - 更新日志格式规范
