# Halo B/S 架构部署文档

## 概述

Halo 现已支持 B/S（Browser/Server）架构部署，所有功能在服务器端实现，用户通过浏览器进行对话、设置等操作。

## 主要特性

- **纯 Web 访问**：无需安装客户端，通过浏览器即可使用
- **多租户支持**：空间归属用户，不同用户数据相互隔离
- **灵活认证**：支持正常认证、禁用认证、简单 Token、请求头认证等多种模式
- **AI 提供商配置**：支持配置文件或界面直接配置 AI 提供商

## 快速开始

### 方式一：Docker 部署（推荐）

```bash
# 使用 docker-compose 启动
docker-compose up -d

# 访问 http://localhost:3000
```

### 方式二：源码部署

```bash
# 安装依赖
npm install

# 构建
npm run build

# 启动服务
npm start
```

### 方式三：PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save
```

## 配置说明

### 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `HALO_PORT` | 服务端口 | 3000 |
| `HALO_HOST` | 绑定地址 | 127.0.0.1 |
| `HALO_DATA_DIR` | 数据目录 | ~/.halo |
| `HALO_AUTH_MODE` | 认证模式 | normal |
| `HALO_DEFAULT_PASSWORD` | 默认管理员密码 | 随机生成 |

### 认证模式说明

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `normal` | 正常用户名密码认证 | 个人使用、小团队 |
| `disabled` | 禁用认证 | 内网环境、系统对接 |
| `hybrid` | 混合认证（固定 Token + JWT） | API 调用、系统集成、页面访问 |
| `header` | 请求头认证 | 反向代理、SSO 集成 |

### 配置文件示例

创建 `server.json` 文件：

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 3000
  },
  "auth": {
    "mode": "normal"
  },
  "aiSources": {
    "providers": [
      {
        "id": "anthropic",
        "name": "Anthropic",
        "type": "anthropic",
        "apiKey": "sk-xxx",
        "baseUrl": "https://api.anthropic.com"
      }
    ]
  }
}
```

## 系统对接

### 禁用认证模式

适用于内网环境或受信任的系统对接场景：

```bash
# 环境变量
HALO_AUTH_MODE=disabled

# 或配置文件
{
  "auth": {
    "mode": "disabled"
  }
}
```

### 混合认证模式

适用于 API 调用和页面访问：

```bash
# 环境变量
HALO_AUTH_MODE=hybrid
HALO_AUTH_SIMPLE_TOKEN=your-token-here

# API 调用
curl -H "Authorization: Bearer your-token-here" http://localhost:3000/api/v1/spaces
```

### 请求头认证模式

适用于反向代理或 SSO 集成：

```bash
# 环境变量
HALO_AUTH_MODE=header
HALO_AUTH_HEADER_NAME=X-User-Id

# Nginx 配置示例
location / {
  proxy_pass http://localhost:3000;
  proxy_set_header X-User-Id $remote_user;
}
```

## 数据隔离

- **空间隔离**：每个空间归属于特定用户
- **数据库隔离**：所有业务数据通过 user_id 字段隔离
- **文件隔离**：用户文件存储在独立目录 `~/.halo/users/{user_id}/spaces/`

## 健康检查

```bash
# 健康检查
curl http://localhost:3000/health

# 就绪检查
curl http://localhost:3000/ready
```

## 故障排查

### 无法访问服务

```bash
# 检查服务状态
docker-compose ps

# 查看日志
docker-compose logs halo

# 检查端口占用
netstat -tlnp | grep 3000
```

### 认证失败

1. 确认认证模式配置正确
2. 检查 Token 是否有效
3. 查看服务端日志

### 数据库错误

```bash
# 重置数据库（谨慎操作）
rm -rf ~/.halo/hello.db

# 重启服务
docker-compose restart
```

## 安全建议

1. **生产环境**：使用 `normal` 认证模式
2. **HTTPS**：通过反向代理启用 HTTPS
3. **防火墙**：限制访问端口
4. **定期备份**：备份 `~/.halo` 数据目录
