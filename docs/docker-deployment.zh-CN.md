# Docker 部署指南

本指南介绍如何使用 Docker 部署 Hello。

## 快速开始

### 项目结构

项目有一个专门的 `docker` 目录，包含所有与 Docker 相关的文件：

```
hello-halo/
├── docker/            # Docker 相关文件
│   ├── Dockerfile     # Docker 构建文件
│   ├── docker-compose.yml  # Docker Compose 配置
│   ├── start.sh       # 启动脚本
│   └── .dockerignore  # Docker 忽略文件
├── config/            # 配置文件
│   ├── server.json    # 服务器配置
│   ├── llm-config.json # LLM 提供商配置
│   └── setup.sh       # 可选的设置脚本
└── ...
```

### 使用 Docker Compose（推荐）

**从 `docker` 目录运行：**

```bash
cd docker
docker-compose up -d
```

**从项目根目录运行：**

```bash
docker-compose -f docker/docker-compose.yml up -d
```

### 使用 Docker Run

**从项目根目录运行：**

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

## 数据目录

Hello 默认将所有数据存储在 `/data/hello` 目录中。包括：

- `hello.db` - SQLite 数据库
- `users/` - 用户数据目录
- `logs/` - 应用日志

### 数据持久化

**重要**：始终挂载卷到 `/data/hello` 以在容器重启时持久化数据。

```yaml
volumes:
  - hello-data:/data/hello  # 命名卷（推荐）
  # 或
  - ./data:/data/hello     # 绑定挂载（用于开发）
```

### 自定义数据目录

你可以使用环境变量指定自定义数据目录：

```yaml
environment:
  - HELLO_DATA_DIR=/custom/data/path
```

## 配置

### 配置目录

Hello 使用统一的配置目录来管理所有配置文件。配置目录默认为 `/app/config`，可以通过以下方式指定：

1. **环境变量**: `HELLO_CONFIG_DIR=/path/to/config`
2. **默认值**: `/app/config`

配置文件搜索优先级：
- `server.json`: `HELLO_CONFIG_PATH` > `{config-dir}/server.json` > `{data-dir}/server.json` > `{cwd}/server.json`
- `llm-config.json`: `{config-dir}/llm-config.json` > `{cwd}/llm-config.json`

### setup.sh 脚本

Hello 支持在启动时执行 `config/setup.sh` 脚本，用于设置环境变量和执行初始化操作。

#### 工作原理
1. 容器启动时，`start.sh` 脚本会检查 `/app/config/setup.sh` 是否存在
2. 如果存在，会执行该脚本（在当前 shell 中执行，所以环境变量会生效）
3. 然后启动 Hello 服务器

#### 创建 setup.sh

在项目的 `config/` 目录下创建 `setup.sh` 文件：

```bash
#!/bin/bash

# 设置环境变量
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk
export PATH=$JAVA_HOME/bin:$PATH

# 设置 API 密钥
export HELLO_ANTHROPIC_API_KEY="your-api-key"
export HELLO_OPENAI_API_KEY="your-api-key"

# 其他初始化操作
echo "Setup completed successfully!"
```

#### 示例：设置 Java 环境

如果你的应用需要 Java 运行时，首先在 Dockerfile 中安装 Java：

```dockerfile
# 在安装其他工具的地方添加 Java
RUN apk add --no-cache python3 make g++ rust cargo curl git jq openssh-client bash openjdk11-jre
```

然后在 `setup.sh` 中设置环境变量：

```bash
#!/bin/bash

# 设置 JAVA_HOME
export JAVA_HOME=/usr/lib/jvm/java-11-openjdk

# 添加 Java 到 PATH
export PATH=$JAVA_HOME/bin:$PATH

# 验证 Java 安装
if command -v java >/dev/null 2>&1; then
    echo "Java version:"
    java -version
else
    echo "Java not found, please install Java in Dockerfile"
fi

echo "Java environment set up!"
```

### 环境变量

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `HELLO_HOST` | 服务器绑定地址 | `0.0.0.0` |
| `HELLO_PORT` | 服务器端口 | `3000` |
| `HELLO_DATA_DIR` | 数据目录路径 | `/data/hello` |
| `HELLO_CONFIG_DIR` | 配置目录路径 | `/app/config` |
| `HELLO_LOG_DIR` | 日志目录路径 | `{data-dir}/logs` |
| `HELLO_LOG_LEVEL` | 日志级别（DEBUG, INFO, WARN, ERROR） | `INFO` |
| `HELLO_AUTH_MODE` | 认证模式（normal, disabled, hybrid, header） | `normal` |
| `HELLO_DEFAULT_PASSWORD` | 默认管理员密码 | (随机) |
| `HELLO_ANTHROPIC_API_KEY` | Anthropic API 密钥 | - |
| `HELLO_OPENAI_API_KEY` | OpenAI API 密钥 | - |

### 配置文件

推荐将配置文件放在配置目录中挂载：

```yaml
volumes:
  # 挂载整个配置目录（推荐）
  - ../config:/app/config:ro  # 从 docker 目录运行时
  # 或
  - ./config:/app/config:ro    # 从项目根目录运行时
```

在 `./config/` 目录下放置以下文件：
- `server.json` - 服务器配置
- `llm-config.json` - LLM 提供商配置
- `setup.sh` - 可选的启动脚本（用于设置环境变量）

也可以单独挂载配置文件（传统方式）：

```yaml
volumes:
  - ./config/server.json:/app/config/server.json:ro
  - ./config/llm-config.json:/app/config/llm-config.json:ro
  - ./config/setup.sh:/app/config/setup.sh:ro
```

示例 `server.json`：

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
    "basePath": "/data/hello",
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

## 生产部署

### 安全考虑

1. **修改默认密码**：始终设置强默认密码
2. **使用密钥**：使用 Docker 密钥或环境文件存储敏感数据
3. **启用 TLS**：使用反向代理（nginx, traefik）进行 HTTPS
4. **限制网络访问**：只暴露必要的端口

### 生产配置示例

```yaml
version: '3.8'

services:
  hello:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    image: hello:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"  # 仅本地访问，使用反向代理
    volumes:
      - hello-data:/data/hello
      - ../config:/app/config:ro
    environment:
      - HELLO_HOST=0.0.0.0
      - HELLO_PORT=3000
      - HELLO_LOG_LEVEL=INFO
    env_file:
      - .env  # 在 .env 文件中存储密钥
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

### 健康检查

Hello 提供健康检查端点：

- `GET /health` - 基本健康检查
- `GET /ready` - 就绪检查（包括数据库检查）

## Docker 启动流程

### 启动流程

1. **容器启动**，以 `start.sh` 脚本作为入口点
2. **检查 setup.sh**：脚本检查 `/app/config/setup.sh` 是否存在
3. **执行 setup.sh**：如果存在，运行脚本设置环境变量
4. **启动 Hello 服务器**：脚本执行 `node dist/server/index.js`

### 启动脚本详情

`docker/start.sh` 脚本执行以下步骤：

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

## 多实例部署

对于运行多个实例，确保每个实例都有唯一的数据目录：

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

## 故障排除

### 检查日志

```bash
# 查看容器日志
docker logs hello

# 查看应用日志
docker exec hello cat /data/hello/logs/server-$(date +%Y-%m-%d).log
```

### 检查数据目录

```bash
# 列出数据目录内容
docker exec hello ls -la /data/hello

# 检查数据库
docker exec hello sqlite3 /data/hello/hello.db ".tables"
```

### 常见问题

1. **权限被拒绝**：确保容器对数据卷有写入权限
2. **端口已被使用**：更改端口映射或停止冲突的服务
3. **数据库被锁定**：确保只有一个实例使用数据目录
