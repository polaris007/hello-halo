# Docker Deployment Guide

This guide explains how to deploy Halo using Docker.

## Quick Start

### Using Docker Compose (Recommended)

Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  halo:
    image: halo:latest
    ports:
      - "3000:3000"
    volumes:
      - halo-data:/app/data
    environment:
      - HALO_HOST=0.0.0.0
      - HALO_PORT=3000
      - HALO_AUTH_MODE=normal
      # Set a default admin password
      - HALO_DEFAULT_PASSWORD=your-secure-password
      # Optional: Set API keys
      # - HALO_ANTHROPIC_API_KEY=your-api-key

volumes:
  halo-data:
```

Start the service:

```bash
docker-compose up -d
```

### Using Docker Run

```bash
docker run -d \
  --name halo \
  -p 3000:3000 \
  -v halo-data:/app/data \
  -e HALO_HOST=0.0.0.0 \
  -e HALO_PORT=3000 \
  -e HALO_DEFAULT_PASSWORD=your-secure-password \
  halo:latest
```

## Data Directory

Halo stores all data in the `/app/data` directory by default. This includes:

- `halo.db` - SQLite database
- `users/` - User data directories
- `logs/` - Application logs
- `server.json` - Configuration file (if created)

### Data Persistence

**Important**: Always mount a volume to `/app/data` to persist data across container restarts.

```yaml
volumes:
  - halo-data:/app/data  # Named volume (recommended)
  # or
  - ./data:/app/data     # Bind mount (for development)
```

### Custom Data Directory

You can specify a custom data directory using environment variables:

```yaml
environment:
  - HALO_DATA_DIR=/custom/data/path
```

Or using command-line arguments:

```yaml
command: ["node", "server.js", "--data-dir", "/custom/data/path"]
```

## Configuration

### Configuration Directory

Halo 使用统一的配置目录来管理所有配置文件。配置目录默认为 `./config`，可以通过以下方式指定：

1. **环境变量**: `HALO_CONFIG_DIR=/path/to/config`
2. **命令行参数**: `--config-dir /path/to/config`
3. **默认值**: `{cwd}/config`

配置文件搜索优先级：
- `server.json`: `HALO_CONFIG_PATH` > `{config-dir}/server.json` > `{data-dir}/server.json` > `{cwd}/server.json`
- `llm-config.json`: `{config-dir}/llm-config.json` > `{cwd}/llm-config.json`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HALO_HOST` | Server bind address | `127.0.0.1` |
| `HALO_PORT` | Server port | `3000` |
| `HALO_DATA_DIR` | Data directory path | `/app/data` |
| `HALO_CONFIG_DIR` | Configuration directory path | `/app/config` |
| `HALO_LOG_DIR` | Log directory path | `{data-dir}/logs` |
| `HALO_LOG_LEVEL` | Log level (DEBUG, INFO, WARN, ERROR) | `INFO` |
| `HALO_AUTH_MODE` | Authentication mode (normal, disabled, hybrid, header) | `normal` |
| `HALO_DEFAULT_PASSWORD` | Default admin password | (random) |
| `HALO_ANTHROPIC_API_KEY` | Anthropic API key | - |
| `HALO_OPENAI_API_KEY` | OpenAI API key | - |

### Configuration Files

推荐将配置文件放在配置目录中挂载：

```yaml
volumes:
  # 挂载整个配置目录（推荐）
  - ./config:/app/config:ro
```

在 `./config/` 目录下放置以下文件：
- `server.json` - 服务器配置
- `llm-config.json` - LLM 提供商配置

也可以单独挂载配置文件（传统方式）：

```yaml
volumes:
  - ./server.json:/app/config/server.json:ro
  - ./llm-config.json:/app/config/llm-config.json:ro
```

Example `server.json`:

```json
{
  "server": {
    "host": "0.0.0.0",
    "port": 3000
  },
  "auth": {
    "mode": "normal",
    "defaultPassword": "your-secure-password"
  },
  "data": {
    "basePath": "/app/data",
    "maxUploadSize": 104857600
  },
  "aiSources": {
    "providers": [
      {
        "id": "anthropic",
        "name": "Anthropic",
        "type": "anthropic",
        "apiKey": "your-api-key",
        "baseUrl": "https://api.anthropic.com"
      }
    ]
  }
}
```

## Production Deployment

### Security Considerations

1. **Change default password**: Always set a strong default password
2. **Use secrets**: Store sensitive data using Docker secrets or environment files
3. **Enable TLS**: Use a reverse proxy (nginx, traefik) for HTTPS
4. **Restrict network access**: Only expose necessary ports

### Example Production Configuration

```yaml
version: '3.8'

services:
  halo:
    image: halo:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"  # Only local access, use reverse proxy
    volumes:
      - halo-data:/app/data
    environment:
      - HALO_HOST=0.0.0.0
      - HALO_PORT=3000
      - HALO_LOG_LEVEL=INFO
    env_file:
      - .env  # Store secrets in .env file
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - halo

volumes:
  halo-data:
```

### Health Checks

Halo provides health check endpoints:

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes database check)

## Multi-Instance Deployment

For running multiple instances, ensure each instance has a unique data directory:

```yaml
services:
  halo-1:
    image: halo:latest
    volumes:
      - halo-data-1:/app/data
    environment:
      - HALO_PORT=3001

  halo-2:
    image: halo:latest
    volumes:
      - halo-data-2:/app/data
    environment:
      - HALO_PORT=3002
```

## Troubleshooting

### Check Logs

```bash
# View container logs
docker logs halo

# View application logs
docker exec halo cat /app/data/logs/server-$(date +%Y-%m-%d).log
```

### Check Data Directory

```bash
# List data directory contents
docker exec halo ls -la /app/data

# Check database
docker exec halo sqlite3 /app/data/halo.db ".tables"
```

### Common Issues

1. **Permission denied**: Ensure the container has write access to the data volume
2. **Port already in use**: Change the port mapping or stop conflicting services
3. **Database locked**: Ensure only one instance is using the data directory
