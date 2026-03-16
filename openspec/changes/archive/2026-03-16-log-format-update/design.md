## Context

当前日志系统包含两种日志文件：
- `server-YYYY-MM-DD.log`: 服务器运行日志，使用结构化文本格式
- `api-YYYY-MM-DD.log`: HTTP 请求/响应日志，使用 JSON 格式

当前格式示例：
- Server: `[2024-03-15T10:30:45.123Z] [INFO] Server started`
- API: `{"type":"http_request_response","timestamp":"2024-03-15T10:30:45.123Z",...}`

问题：
1. 时间戳使用 `toISOString()` 返回 UTC 时间，与本地时间可能相差数小时
2. API 日志使用 JSON 格式，单行显示，不便于快速浏览和定位问题

## Goals / Non-Goals

**Goals:**
- 统一所有日志文件的时间戳格式为本地系统时间
- 将 API 日志从 JSON 格式改为结构化文本格式，与 server 日志对齐
- 保持日志可解析性（仍可通过正则表达式解析）

**Non-Goals:**
- 不改变日志文件的命名规则（仍按日期轮转）
- 不改变日志级别或过滤逻辑
- 不添加新的日志字段

## Decisions

### Decision 1: 时间戳格式

**选择**: 使用本地系统时间，格式为 `YYYY-MM-DDTHH:mm:ss.SSS`

**实现方式**: 创建 `formatLocalTimestamp()` 函数，使用 `Date` 对象的本地时间方法

```typescript
function formatLocalTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`
}
```

**替代方案**:
- 使用 `toLocaleString()` - 但格式因 locale 不同而变化，不够稳定
- 使用 `toISOString()` 并转换时区 - 更复杂，需要额外处理时区偏移

### Decision 2: API 日志格式

**选择**: 结构化文本格式，每条日志单行

**格式**:
```
[YYYY-MM-DDTHH:mm:ss.SSS] [INFO] HTTP 请求: GET /api/v1/users - 200 - 45ms - 127.0.0.1
[YYYY-MM-DDTHH:mm:ss.SSS] [INFO] HTTP 请求详情: 请求头=..., 请求体=...
[YYYY-MM-DDTHH:mm:ss.SSS] [INFO] HTTP 响应详情: 响应体=...
```

**替代方案**:
- 保持 JSON 格式，仅修改时间戳 - 不符合"便于阅读"的目标
- 多行文本格式（请求头每个一行）- 不便于 grep 和日志分析工具处理

## Risks / Trade-offs

### Risk 1: 日志解析兼容性
**风险**: 现有的日志解析脚本可能依赖 JSON 格式或 UTC 时间

**缓解措施**:
- 更新日志解析相关文档
- 新格式仍可通过正则表达式解析，便于迁移

### Risk 2: 时区一致性
**风险**: 多服务器部署时，不同时区的服务器日志时间不一致

**缓解措施**:
- 当前项目为单服务器部署，此风险较低
- 如需多服务器部署，可考虑在日志中添加时区信息（非本次范围）

## Migration Plan

1. 修改 `formatTimestamp()` 函数实现
2. 修改 API 日志中间件的日志格式
3. 更新单元测试
4. 更新相关规范文档

无需数据库迁移或配置迁移，代码变更后立即生效。
