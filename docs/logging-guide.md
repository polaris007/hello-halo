# Halo 日志配置指南

本文档介绍 Halo 的日志系统配置选项、环境变量和最佳实践。

## 目录

- [日志目录结构](#日志目录结构)
- [环境变量配置](#环境变量配置)
- [日志文件说明](#日志文件说明)
- [日志轮转和保留](#日志轮转和保留)
- [故障排查](#故障排查)
- [监控建议](#监控建议)
- [Docker 配置](#docker-配置)

---

## 日志目录结构

### 默认日志目录

**Server 启动时默认使用应用启动目录下的 `logs/` 目录：**

```
<应用启动目录>/logs/
├── server-2024-01-15.log      # Server 主日志
├── api-2024-01-15.log         # HTTP API 请求/响应日志
├── ai-2024-01-15.log          # AI 交互日志
└── client-2024-01-15.log      # Client 端日志（通过 API 上报）
```

### 日志文件命名格式

所有日志文件均采用按天轮转的命名格式：`<类型>-YYYY-MM-DD.log`

---

## 环境变量配置

### 基础配置

| 环境变量 | 说明 | 默认值 | 示例 |
|---------|------|--------|------|
| `HALO_LOG_DIR` | 日志文件存储目录 | `<cwd>/logs` | `/var/log/halo` |
| `HALO_LOG_LEVEL` | Server 日志级别 | `INFO` | `DEBUG`、`INFO`、`WARN`、`ERROR` |
| `HALO_LOG_CONSOLE` | 是否输出到控制台 | `true` | `true`、`false` |

### 日志轮转配置

| 环境变量 | 说明 | 默认值 | 示例 |
|---------|------|--------|------|
| `HALO_LOG_RETENTION_DAYS` | 日志文件保留天数 | `7` | `30` |
| `HALO_LOG_MAX_SIZE_MB` | 单个日志文件最大大小 (MB) | `100` | `500` |

### API 日志配置

| 环境变量 | 说明 | 默认值 | 示例 |
|---------|------|--------|------|
| `HALO_LOG_API_DETAIL` | 是否记录详细 API 报文 | `true` | `true`、`false` |

### AI 日志配置

| 环境变量 | 说明 | 默认值 | 示例 |
|---------|------|--------|------|
| `HALO_LOG_AI_DETAIL` | 是否记录详细 AI 交互 | `true` | `true`、`false` |
| `HALO_LOG_AI_MAX_SIZE` | AI 日志截断长度 (字符) | `2048` | `4096` |

---

## 日志文件说明

### server-YYYY-MM-DD.log

**Server 主日志文件**，包含：

- Server 启动/关闭信息
- 应用级别的事件和错误
- 数据库操作日志
- 认证和授权事件

**示例内容：**

```
[2024-01-15T10:30:00.000Z] [INFO] Server started on port 3000
[2024-01-15T10:30:01.123Z] [INFO] Database connection established
[2024-01-15T10:31:15.456Z] [WARN] High memory usage detected: 85%
[2024-01-15T10:32:00.789Z] [ERROR] Failed to connect to external API
```

### api-YYYY-MM-DD.log

**HTTP API 请求/响应日志**，包含：

- 请求方法、URL、客户端 IP
- 请求头和请求体（已脱敏）
- 响应状态码和响应体
- 请求处理时长

**示例内容：**

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "type": "http_request_response",
  "clientIp": "192.168.1.100",
  "method": "POST",
  "url": "/api/v1/spaces",
  "headers": {
    "content-type": "application/json",
    "authorization": "[REDACTED]"
  },
  "requestBody": "{\"name\":\"My Space\"}",
  "statusCode": 201,
  "responseBody": "{\"id\":\"abc123\",\"name\":\"My Space\"}",
  "duration": "45ms"
}
```

### ai-YYYY-MM-DD.log

**AI 交互日志**，包含：

- AI 请求的 prompt 和参数
- AI 响应的内容
- Token 使用量
- 请求耗时和错误信息

**示例内容：**

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "type": "ai_request",
  "requestId": "ai-1705312200000-abc123",
  "model": "claude-sonnet-4-20250514",
  "userId": "user-123",
  "request": {
    "content": "{\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}",
    "sanitizedContent": "{\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}",
    "length": 45
  },
  "status": "sent"
}
```

### client-YYYY-MM-DD.log

**Client 端上报日志**，包含前端应用的日志信息。

---

## 日志轮转和保留

### 按天轮转

日志文件每天自动轮转，新的一天会创建新的日志文件。

### 按大小轮转

当日志文件超过 `HALO_LOG_MAX_SIZE_MB` 配置的大小时，会自动轮转。轮转后的文件会添加时间戳：

```
server-2024-01-15.log              # 当前日志文件
server-2024-01-15-20240115103000.log  # 轮转后的文件
```

### 保留策略

默认保留最近 7 天的日志文件。可以通过 `HALO_LOG_RETENTION_DAYS` 环境变量配置。

**清理时间：** 每天创建新日志文件时自动执行清理。

---

## 故障排查

### 问题：日志文件没有生成

**检查清单：**

1. 确认日志目录存在且有写权限
   ```bash
   ls -la /path/to/logs
   ```

2. 检查 `HALO_LOG_DIR` 环境变量是否正确设置
   ```bash
   echo $HALO_LOG_DIR
   ```

3. 检查 Server 启动日志输出，确认日志目录信息
   ```
   Log directory: /path/to/logs
   Current log file: /path/to/logs/server-2024-01-15.log
   ```

### 问题：日志文件增长过快

**解决方案：**

1. 调整日志级别为 `WARN` 或 `ERROR`
   ```bash
   export HALO_LOG_LEVEL=WARN
   ```

2. 关闭详细 API 日志
   ```bash
   export HALO_LOG_API_DETAIL=false
   ```

3. 关闭详细 AI 日志
   ```bash
   export HALO_LOG_AI_DETAIL=false
   ```

4. 减小日志保留天数
   ```bash
   export HALO_LOG_RETENTION_DAYS=3
   ```

### 问题：磁盘空间不足

**解决方案：**

1. 手动清理旧日志文件
   ```bash
   rm /path/to/logs/server-2024-*.log
   ```

2. 调整日志文件大小限制
   ```bash
   export HALO_LOG_MAX_SIZE_MB=50
   ```

3. 配置日志目录到独立磁盘分区

### 问题：无法找到特定日志

**检查清单：**

1. 确认日志日期是否正确
2. 检查日志是否已被清理（超过保留期限）
3. 确认日志级别设置是否正确

---

## 监控建议

### 日志文件大小监控

**推荐工具：**

- **Linux:** 使用 `logrotate` 或自定义脚本
- **Windows:** 使用任务计划程序 + PowerShell 脚本
- **Docker:** 使用 Docker 日志驱动配置

**示例监控脚本 (Linux)：**

```bash
#!/bin/bash
LOG_DIR="/var/log/halo"
MAX_SIZE_MB=500

for file in $LOG_DIR/*.log; do
  size=$(stat -c%s "$file")
  size_mb=$((size / 1024 / 1024))
  if [ $size_mb -gt $MAX_SIZE_MB ]; then
    echo "Warning: $file exceeds ${MAX_SIZE_MB}MB"
    # 可以触发告警或自动清理
  fi
done
```

### 错误率监控

**建议：**

1. 定期检查日志中的 `ERROR` 级别条目
2. 设置错误频率告警（如每分钟超过 10 个错误）
3. 监控 AI 请求失败率

**示例检查命令：**

```bash
# 统计今天的错误数量
grep -c "\[ERROR\]" /path/to/logs/server-$(date +%Y-%m-%d).log

# 查看最近的错误
tail -100 /path/to/logs/server-$(date +%Y-%m-%d).log | grep "\[ERROR\]"
```

### 性能监控

**关键指标：**

- 日志写入延迟（应小于 10ms/条）
- 日志轮转时间（应小于 100ms）
- 磁盘 I/O 使用率

---

## Docker 配置

### Docker Compose 日志卷挂载

```yaml
version: '3.8'

services:
  halo:
    image: halo:latest
    volumes:
      # 挂载日志目录到宿主机
      - ./logs:/app/logs
      # 或者挂载到独立的日志卷
      # - halo-logs:/var/log/halo
    environment:
      - HALO_LOG_DIR=/app/logs
      - HALO_LOG_LEVEL=INFO
      - HALO_LOG_RETENTION_DAYS=7
      - HALO_LOG_MAX_SIZE_MB=100

volumes:
  halo-logs:
```

### Docker 日志驱动配置

**使用 json-file 日志驱动：**

```yaml
services:
  halo:
    image: halo:latest
    logging:
      driver: "json-file"
      options:
        max-size: "100m"
        max-file: "3"
```

**使用 syslog 日志驱动：**

```yaml
services:
  halo:
    image: halo:latest
    logging:
      driver: "syslog"
      options:
        syslog-address: "udp://localhost:514"
        tag: "halo"
```

### 生产环境建议

1. **使用独立日志卷** 避免日志占用容器层空间
   ```yaml
   volumes:
     - halo-logs:/app/logs
   ```

2. **配置日志轮转** 防止单个日志文件过大
   ```bash
   HALO_LOG_MAX_SIZE_MB=50
   HALO_LOG_RETENTION_DAYS=14
   ```

3. **集中日志管理** 考虑使用 ELK Stack 或类似工具

---

## 最佳实践

### 开发环境

```bash
HALO_LOG_LEVEL=DEBUG
HALO_LOG_CONSOLE=true
HALO_LOG_API_DETAIL=true
HALO_LOG_AI_DETAIL=true
```

### 生产环境

```bash
HALO_LOG_LEVEL=INFO
HALO_LOG_CONSOLE=false
HALO_LOG_API_DETAIL=true
HALO_LOG_AI_DETAIL=true
HALO_LOG_RETENTION_DAYS=14
HALO_LOG_MAX_SIZE_MB=100
```

### 调试模式（详细日志）

```bash
HALO_LOG_LEVEL=DEBUG
HALO_LOG_CONSOLE=true
HALO_LOG_API_DETAIL=true
HALO_LOG_AI_DETAIL=true
HALO_LOG_AI_MAX_SIZE=8192
```

---

## 日志迁移指南

### 从旧日志目录迁移

如果你之前使用 `~/.halo/logs` 目录，可以通过设置环境变量继续使用：

```bash
export HALO_LOG_DIR=~/.halo/logs
```

### 日志备份

定期备份重要日志文件：

```bash
# 创建日志备份
tar -czf halo-logs-backup-$(date +%Y%m%d).tar.gz /path/to/logs/

# 备份到远程存储
rsync -avz /path/to/logs/ user@backup-server:/backup/halo-logs/
```

---

## 相关文档

- [BS 架构说明](./README.bs-architecture.md)
- [自定义 Provider 配置](./custom-providers.md)
