# SaaS Architecture Migration Proposal

## Why

Halo 当前是 Electron 桌面应用，仅限于单机使用。为了支持团队协作和 SaaS 部署模式，需要将其改造为 B/S 架构的 Web 应用。改造后，用户可以通过浏览器访问，所有计算和存储在服务器端完成，实现多用户共享、集中管理和远程协作。

## What Changes

### Architecture Changes
- **BREAKING**: 移除 Electron 依赖，改为纯 Web 应用
- **BREAKING**: 前端通过 HTTP/WebSocket 与后端通信，替代 IPC
- **BREAKING**: 文件系统操作、命令执行全部移至后端服务器
- **BREAKING**: 移除 AI Browser 功能（浏览器环境无法嵌入 BrowserView）
- **BREAKING**: 移除产物展示功能

### New Capabilities
- **用户认证系统**: 支持多用户登录、注册、会话管理
- **多租户数据隔离**: 空间、配置、数据按用户隔离
- **AI 提供商配置**: 通过配置文件或管理界面配置 API Key
- **用户管理**: 管理员可管理用户、分配权限

### Data Storage Changes
- 后端继续使用 SQLite 数据库存储
- 数据库路径改为按用户隔离: `~/.halo/users/{user_id}/`
- 配置存储在后端，前端仅展示和修改
- API Key 等配置信息明文存储于后端数据库（内部部署场景）

### API Changes
- 保留并扩展 HTTP API: `/api/v1/`
- WebSocket 用于实时通信（替代 IPC 事件）
- 新增认证 API: `/api/v1/auth/*`
- 新增用户管理 API: `/api/v1/admin/users`

## Capabilities

### New Capabilities
- `user-authentication`: 用户登录、注册、会话管理、JWT 认证
- `multi-tenancy`: 用户数据隔离、空间归属、权限控制
- `saas-admin`: 用户管理、系统配置、租户管理
- `ai-provider-config`: AI 提供商配置管理（后端存储）
- `web-frontend`: 纯 Web 前端（移除 Electron）

### Modified Capabilities
- `file-operations`: 文件操作从本地移至后端，增加用户隔离
- `agent-execution`: AI Agent 执行环境改为服务器端
- `space-management`: 空间增加用户归属字段
- `conversation-storage`: 对话数据按用户隔离存储

## Impact

### Code Changes
- `src/main/`: 移除 Electron 相关代码，保留服务端逻辑
- `src/renderer/`: 改为纯 React 应用，移除 IPC 调用
- `src/preload/`: **完全移除**
- `src/server/`: 扩展为完整的后端服务

### Dependencies
- **移除**: `electron`, `electron-log`, `@electron-toolkit/*`
- **新增**: `jsonwebtoken`, `bcryptjs`, `express-session` 或类似认证库

### Configuration
- 后端配置文件: `~/.halo/config.json`（系统级）
- 用户数据目录: `~/.halo/users/{user_id}/`
- AI 提供商配置存储于后端数据库

### Deployment
- 支持单机部署（个人使用）
- 支持服务器部署（团队协作）
- 支持容器化部署（Docker）
