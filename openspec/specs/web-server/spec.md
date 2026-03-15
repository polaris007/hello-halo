# Web Server

## Purpose

TBD - HTTP REST API 和 WebSocket 实时通信能力，提供前端静态文件服务和文件上传下载。

## Requirements

### Requirement: HTTP REST API

系统 SHALL 提供完整的 HTTP REST API 供前端调用。

#### Scenario: API 基础路径
- **WHEN** 前端调用 API
- **THEN** 所有 API 以 `/api/v1/` 为前缀

#### Scenario: 统一响应格式
- **WHEN** API 返回成功响应
- **THEN** 响应体格式为 `{ "success": true, "data": {...} }`

#### Scenario: 统一错误格式
- **WHEN** API 返回错误响应
- **THEN** 响应体格式为 `{ "success": false, "error": { "code": "...", "message": "..." } }`

#### Scenario: CORS 支持
- **WHEN** 浏览器发送跨域请求
- **THEN** 系统返回正确的 CORS 头

### Requirement: WebSocket 实时通信

系统 SHALL 通过 WebSocket 提供实时事件推送。

#### Scenario: WebSocket 连接
- **WHEN** 客户端连接 WebSocket
- **THEN** 系统建立长连接并验证 Token

#### Scenario: 事件推送
- **WHEN** 服务端产生事件（如 Agent 思考、文件变更）
- **THEN** 系统通过 WebSocket 推送给对应客户端

#### Scenario: 断线重连
- **WHEN** WebSocket 连接断开
- **THEN** 客户端自动重连并恢复订阅

### Requirement: 静态文件服务

系统 SHALL 提供前端静态文件服务。

#### Scenario: SPA 路由
- **WHEN** 用户访问任意路径
- **THEN** 系统返回 index.html（前端处理路由）

#### Scenario: 静态资源
- **WHEN** 用户请求 JS/CSS 等静态资源
- **THEN** 系统返回对应文件并设置缓存头

### Requirement: 文件上传下载

系统 SHALL 支持文件上传和下载。

#### Scenario: 文件上传
- **WHEN** 用户上传文件到指定空间
- **THEN** 系统保存文件到服务端并返回文件路径

#### Scenario: 文件下载
- **WHEN** 用户下载文件
- **THEN** 系统返回文件内容

#### Scenario: 文件大小限制
- **WHEN** 用户上传超过 100MB 的文件
- **THEN** 系统返回 413 错误

### Requirement: 服务器日志配置

系统 SHALL 提供灵活的服务器日志配置选项。

#### Scenario: 日志目录配置
- **WHEN** server 启动时
- **THEN** 系统使用环境变量 `HALO_LOG_DIR` 的值作为日志目录（如果设置）
- **WHEN** 环境变量 `HALO_LOG_DIR` 未设置
- **THEN** 系统使用 `<应用启动目录>/logs/` 作为默认日志目录

#### Scenario: 日志级别配置
- **WHEN** 设置了环境变量 `HALO_LOG_LEVEL=DEBUG`
- **THEN** server 记录所有级别的日志（DEBUG、INFO、WARN、ERROR）
- **WHEN** 设置了环境变量 `HALO_LOG_LEVEL=INFO`
- **THEN** server 记录 INFO、WARN、ERROR 级别的日志
- **WHEN** 设置了环境变量 `HALO_LOG_LEVEL=WARN`
- **THEN** server 记录 WARN、ERROR 级别的日志
- **WHEN** 设置了环境变量 `HALO_LOG_LEVEL=ERROR`
- **THEN** server 仅记录 ERROR 级别的日志

#### Scenario: 控制台输出配置
- **WHEN** 设置了环境变量 `HALO_LOG_CONSOLE=false`
- **THEN** server 不输出日志到控制台
- **AND** 日志仅写入文件
- **WHEN** 设置了环境变量 `HALO_LOG_CONSOLE=true`
- **THEN** server 同时输出日志到控制台和文件

#### Scenario: 客户端日志接收端点
- **WHEN** client 发送日志到 server
- **THEN** 系统提供 POST `/api/v1/logs/client` 端点接收客户端日志
- **AND** server 将接收到的客户端日志写入 `<日志目录>/client-YYYY-MM-DD.log` 文件

#### Scenario: 日志轮转配置
- **WHEN** 设置了环境变量 `HALO_LOG_ROTATION_DAYS=30`
- **THEN** 系统保留最近 30 天的日志文件
- **WHEN** 环境变量 `HALO_LOG_ROTATION_DAYS` 未设置
- **THEN** 系统默认保留最近 7 天的日志文件

#### Scenario: 日志文件大小配置
- **WHEN** 设置了环境变量 `HALO_LOG_MAX_SIZE_MB=500`
- **THEN** 当单个日志文件大小超过 500MB 时自动轮转
- **WHEN** 环境变量 `HALO_LOG_MAX_SIZE_MB` 未设置
- **THEN** 当单个日志文件大小超过 100MB 时自动轮转

### Requirement: 服务启动配置

系统 SHALL 支持灵活的启动配置，包括日志相关配置。

#### Scenario: 端口配置
- **WHEN** 用户指定端口号
- **THEN** 服务监听指定端口（默认 3000）

#### Scenario: 绑定地址配置
- **WHEN** 用户指定绑定地址
- **THEN** 服务绑定指定地址（默认 127.0.0.1）

#### Scenario: 配置文件
- **WHEN** 存在配置文件 ~/.halo/server.json
- **THEN** 系统从配置文件读取配置，包括日志配置

#### Scenario: 环境变量
- **WHEN** 设置环境变量 HALO_PORT
- **THEN** 系统使用环境变量覆盖配置
- **WHEN** 设置环境变量 HALO_LOG_DIR
- **THEN** 系统使用环境变量指定的目录作为日志目录
- **WHEN** 设置环境变量 HALO_LOG_LEVEL
- **THEN** 系统使用环境变量指定的级别作为日志级别

### Requirement: 健康检查

系统 SHALL 提供健康检查端点。

#### Scenario: 健康检查
- **WHEN** 请求 GET /health
- **THEN** 系统返回 `{ "status": "ok" }`

#### Scenario: 就绪检查
- **WHEN** 请求 GET /ready
- **THEN** 系统检查数据库连接并返回状态
