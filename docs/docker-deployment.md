# Docker Deployment Guide

This guide explains how to deploy Hello using Docker.

## Quick Start

### Project Structure

The project has a dedicated `docker` directory containing all Docker-related files:

```
hello-halo/
├── docker/            # Docker-related files
│   ├── Dockerfile     # Docker build file
│   ├── docker-compose.yml  # Docker Compose configuration
│   ├── start.sh       # Startup script
│   └── .dockerignore  # Docker ignore file
├── config/            # Configuration files
│   ├── server.json    # Server configuration
│   ├── llm-config.json # LLM provider configuration
│   └── setup.sh       # Optional setup script
└── ...
```

### Using Docker Compose (Recommended)

**From the `docker` directory:**

```bash
cd docker
docker-compose up -d
```

**From the project root:**

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### Using Docker Run

**From the project root:**

```bash
docker build -f docker/Dockerfile -t hello:latest .

docker run -d \
  --name hello \
  -p 3000:3000 \
  -v hello-data:/data/hello \
  -v ./config:/app/config:ro \
  -e HELLO_HOST=0.0.0.0 \
  -e HELLO_PORT=3000 \
  -e HELLO_DEFAULT_PASSWORD=your-secure-password \
  hello:latest
```

## Data Directory

Hello stores all data in the `/data/hello` directory by default. This includes:

- `hello.db` - SQLite database
- `users/` - User data directories
- `logs/` - Application logs

### Data Persistence

**Important**: Always mount a volume to `/data/hello` to persist data across container restarts.

```yaml
volumes:
  - halo-data:/data/hello  # Named volume (recommended)
  # or
  - ./data:/data/hello     # Bind mount (for development)
```

### Custom Data Directory

You can specify a custom data directory using environment variables:

```yaml
environment:
  - HELLO_DATA_DIR=/custom/data/path
```

## Configuration

### Configuration Directory

Hello 使用统一的配置目录来管理所有配置文件。配置目录默认为 `./config`，可以通过以下方式指定：

1. **环境变量**: `HELLO_CONFIG_DIR=/path/to/config`
2. **命令行参数**: `--config-dir /path/to/config`
3. **默认值**: `{cwd}/config`

配置文件搜索优先级：
- `server.json`: `HELLO_CONFIG_PATH` > `{config-dir}/server.json` > `{data-dir}/server.json` > `{cwd}/server.json`
- `llm-config.json`: `{config-dir}/llm-config.json` > `{cwd}/llm-config.json`

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `HELLO_HOST` | Server bind address | `127.0.0.1` |
| `HELLO_PORT` | Server port | `3000` |
| `HELLO_DATA_DIR` | Data directory path | `/app/data` |
| `HELLO_CONFIG_DIR` | Configuration directory path | `/app/config` |
| `HELLO_LOG_DIR` | Log directory path | `{data-dir}/logs` |
| `HELLO_LOG_LEVEL` | Log level (DEBUG, INFO, WARN, ERROR) | `INFO` |
| `HELLO_AUTH_MODE` | Authentication mode (normal, disabled, hybrid, header) | `normal` |
| `HELLO_DEFAULT_PASSWORD` | Default admin password | (random) |
| `HELLO_ANTHROPIC_API_KEY` | Anthropic API key | - |
| `HELLO_OPENAI_API_KEY` | OpenAI API key | - |

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
  hello:
    image: hello:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"  # Only local access, use reverse proxy
    volumes:
      - hello-data:/app/data
    environment:
      - HELLO_HOST=0.0.0.0
      - HELLO_PORT=3000
      - HELLO_LOG_LEVEL=INFO
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
      - hello

volumes:
  hello-data:
```

### Health Checks

Hello provides health check endpoints:

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes database check)

## Docker Startup Process

### Startup Flow

1. **Container starts** with the `start.sh` script as the entry point
2. **Check for setup.sh**: The script checks if `/app/config/setup.sh` exists
3. **Execute setup.sh**: If found, it runs the script to set environment variables
4. **Start Hello server**: The script executes `node dist/server/index.js`

### Startup Script Details

The `docker/start.sh` script performs the following steps:

```bash
#!/bin/sh

# Check if setup.sh exists and execute it
if [ -f "/app/config/setup.sh" ]; then
  echo "Found setup.sh, executing..."
  chmod +x /app/config/setup.sh
  . /app/config/setup.sh
else
  echo "No setup script."
fi

# Start the server
exec node dist/server/index.js
```

## Multi-Instance Deployment

For running multiple instances, ensure each instance has a unique data directory:

```yaml
services:
  hello-1:
    image: hello:latest
    volumes:
      - hello-data-1:/data/hello
    environment:
      - HELLO_PORT=3001

  hello-2:
    image: hello:latest
    volumes:
      - hello-data-2:/data/hello
    environment:
      - HELLO_PORT=3002
```

## Troubleshooting

### Check Logs

```bash
# View container logs
docker logs hello

# View application logs
docker exec hello cat /app/data/logs/server-$(date +%Y-%m-%d).log
```

### Check Data Directory

```bash
# List data directory contents
docker exec hello ls -la /app/data

# Check database
docker exec hello sqlite3 /app/data/hello.db ".tables"
```

### Common Issues

1. **Permission denied**: Ensure the container has write access to the data volume
2. **Port already in use**: Change the port mapping or stop conflicting services
3. **Database locked**: Ensure only one instance is using the data directory
