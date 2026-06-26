# Hello

***

## Logging Configuration

Hello provides comprehensive logging capabilities that can be configured using environment variables. Logs are stored in the application directory by default.

### Log Types

- **Server Logs**: General server operations and errors (`server-YYYY-MM-DD.log`)
- **API Logs**: HTTP request/response logs (`api-YYYY-MM-DD.log`)
- **AI Logs**: AI model interactions and responses (`ai-YYYY-MM-DD.log`)

### Environment Variables

| Variable                  | Description                                   | Default                              |
| ------------------------- | --------------------------------------------- | ------------------------------------ |
| `HELLO_LOG_DIR`            | Directory where log files are stored          | `./logs` (relative to app directory) |
| `HELLO_LOG_LEVEL`          | Minimum log level to record                   | `INFO` (DEBUG/INFO/WARN/ERROR)       |
| `HELLO_LOG_CONSOLE`        | Whether to output logs to console             | `true`                               |
| `HELLO_LOG_RETENTION_DAYS` | Number of days to keep log files              | `7`                                  |
| `HELLO_LOG_MAX_SIZE_MB`    | Maximum size of log files before rotation     | `100`                                |
| `HELLO_LOG_API_DETAIL`     | Whether to log detailed HTTP request/response | `true`                               |
| `HELLO_LOG_AI_DETAIL`      | Whether to log detailed AI interactions       | `true`                               |

### Log File Rotation

- **Daily Rotation**: New log files are created each day
- **Size-based Rotation**: Log files rotate when they exceed the configured size limit
- **Retention Policy**: Old log files are automatically deleted after the retention period

### Sensitive Information Protection

- **Automatic Redaction**: Sensitive headers (Authorization, Cookie, API keys) are automatically redacted
- **Request/Response Truncation**: Large request/response bodies are truncated (1MB limit)
- **AI Token Redaction**: API keys and access tokens in AI requests are redacted

### Example Configuration

```bash
# Store logs in a custom directory
export HELLO_LOG_DIR="/var/log/hello"

# Only log errors and warnings
export HELLO_LOG_LEVEL="WARN"

# Disable console output
export HELLO_LOG_CONSOLE="false"

# Keep logs for 30 days
export HELLO_LOG_RETENTION_DAYS="30"

# Rotate logs at 50MB
export HELLO_LOG_MAX_SIZE_MB="50"

# Disable detailed API logging for performance
export HELLO_LOG_API_DETAIL="false"

# Enable detailed AI logging
export HELLO_LOG_AI_DETAIL="true"
```

## Configuration Directory

Hello 使用统一的配置目录管理所有配置文件（`server.json`、`llm-config.json` 等）。

### 配置目录位置

按优先级排列：

1. **环境变量**: `HELLO_CONFIG_DIR=/path/to/config`
2. **命令行参数**: `--config-dir /path/to/config`
3. **默认值**: `./config`（当前工作目录下）

### 配置文件

| 文件                | 说明                        |
| ----------------- | ------------------------- |
| `server.json`     | 服务器配置（端口、认证、数据目录等）        |
| `llm-config.json` | LLM 提供商配置（API keys、模型选择等） |

### Docker 部署

```yaml
volumes:
  # 挂载配置目录
  - ./config:/app/config:ro
environment:
  - HELLO_CONFIG_DIR=/app/config
```

***

### Build from Source

For developers who want to contribute or customize:

```bash
git clone https://github.com/hello-server.git
cd hello-server
npm install
npm run dev
```

***

## Development

```bash
npm run dev          # Start development server with hot reload
npm run build        # Build for production
npm run test         # Run tests
npm run package      # Package for distribution
```
