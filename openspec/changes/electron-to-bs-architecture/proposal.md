## Why

当前 Halo 是一个 Electron 桌面应用，用户需要在本地安装才能使用。这带来了以下问题：

1. **部署复杂**：用户需要在不同平台（Windows、macOS、Linux）安装客户端
2. **维护成本高**：需要维护多个平台的安装包和更新机制
3. **访问受限**：用户只能在自己的电脑上使用，无法跨设备访问
4. **资源占用**：Electron 应用占用较多系统资源

将其改造为 B/S 架构后，用户只需通过浏览器即可使用，服务端统一管理资源和数据，大幅降低部署和维护成本。

## What Changes

### 架构变更

- **BREAKING**：移除 Electron 桌面应用壳，改为纯 Web 应用
- **BREAKING**：移除 IPC 通信层，改为纯 HTTP/WebSocket API
- **BREAKING**：移除 Preload 脚本，前端直接通过 HTTP 调用服务端 API

### 功能变更

- **BREAKING**：移除 AI Browser 功能（依赖 Electron 的 BrowserView）
- **BREAKING**：移除产物展示功能
- **BREAKING**：移除系统托盘功能
- **BREAKING**：移除自动更新功能（桌面应用特有）
- 移除 Electron 主进程，将其中的服务层提取为独立的 Node.js 服务端
- 前端打包为 SPA，通过浏览器访问
- 所有文件操作在服务端执行，操作服务端文件系统

### 新增功能

- 用户认证系统：支持用户登录和会话管理
- 多用户数据隔离：不同用户的空间、配置、对话数据相互隔离

## Capabilities

### New Capabilities

- `user-auth`：用户认证与授权系统，支持用户注册、登录、会话管理
- `multi-tenant`：多租户数据隔离，确保不同用户的数据安全和隔离
- `web-server`：Web 服务端，提供 HTTP REST API 和 WebSocket 实时通信

### Modified Capabilities

- `space-management`：空间管理功能从本地文件操作改为服务端文件操作
- `conversation`：对话功能从本地存储改为服务端存储，支持多用户隔离
- `agent-session`：Agent 会话从本地进程改为服务端进程管理

## Impact

### 代码变更

| 模块 | 变更类型 | 说明 |
|------|----------|------|
| `src/main/` | 大规模重构 | 移除 Electron 依赖，提取为独立服务端 |
| `src/renderer/` | 中等重构 | 移除 IPC 调用，改为 HTTP API |
| `src/preload/` | 删除 | 不再需要 |
| `src/main/services/ai-browser/` | 删除 | AI Browser 功能移除 |
| `src/main/http/` | 扩展 | 作为主入口，补充完整 API |
| `electron.vite.config.ts` | 删除 | 改用纯 Vite 配置 |

### 依赖变更

- 移除：`electron`、`electron-log`、`electron-updater`、`better-sqlite3`（或保留）
- 新增：可能的数据库客户端（如 PostgreSQL/MySQL 客户端）
- 保留：`express`、`ws`、`@anthropic-ai/claude-agent-sdk` 等核心依赖

### API 变更

- 所有 IPC 方法改为 REST API 端点
- WebSocket 事件保持不变（已与服务端事件对齐）
