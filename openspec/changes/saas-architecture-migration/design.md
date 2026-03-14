# SaaS Architecture Migration - Design Document

## Context

Halo 当前是基于 Electron 的桌面应用，架构如下：

```
┌─────────────────────────────────────────────────────────────┐
│                    Halo (Electron)                           │
├─────────────────────────┬───────────────────────────────────┤
│   Electron Main         │      Express Server               │
│   - Window management   │      - AI Agent Service           │
│   - IPC handlers        │      - Database (SQLite)          │
│   - File system         │      - WebSocket                  │
└─────────────────────────┴───────────────────────────────────┘
              ↑                              ↑
              └──────── 同一进程内通信 ────────┘
```

改造目标：
```
┌─────────────────┐      HTTP/WebSocket      ┌─────────────────┐
│   React SPA     │  ←──────────────────→   │   Node.js       │
│   (Browser)     │                         │   Backend       │
│                 │                         │                 │
│  - UI Rendering │                         │  - REST API     │
│  - State Mgmt   │                         │  - WebSocket    │
│  - API Calls    │                         │  - SQLite       │
│                 │                         │  - File Ops     │
└─────────────────┘                         │  - AI Agent     │
                                            └─────────────────┘
```

## Goals / Non-Goals

**Goals:**
- 移除 Electron 依赖，改为纯 Web 应用
- 实现用户认证系统（JWT-based）
- 实现多租户数据隔离
- 保留现有功能：空间管理、对话、AI Agent、MCP
- 支持单机部署（个人）和服务器部署（团队）

**Non-Goals:**
- 不改为微服务架构（保持单体应用）
- 不替换 SQLite（保持轻量级）
- 不实现复杂的 RBAC（仅区分普通用户和管理员）
- 不保留 AI Browser 功能（浏览器环境限制）

## Decisions

### 1. 认证方案：JWT vs Session

**决策**: 使用 JWT (JSON Web Token)

**理由**:
- 无状态，适合水平扩展
- 前端存储在 localStorage，每次请求自动携带
- 支持 Token 过期和刷新机制

**替代方案**: Express Session + Cookie
- 需要服务器端存储会话状态
- 需要处理 CSRF 防护
- 更适合传统服务端渲染应用

### 2. 数据隔离方案

**决策**: 数据库级隔离（单库 + user_id 字段）

**表结构变更**:
```sql
-- 新增 users 表
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'user', -- 'admin' | 'user'
  created_at INTEGER,
  updated_at INTEGER
);

-- 现有表增加 user_id
ALTER TABLE spaces ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE configs ADD COLUMN user_id TEXT REFERENCES users(id);
```

**理由**:
- 简单，易于维护
- SQLite 不适合多库架构
- 查询时通过 `WHERE user_id = ?` 过滤

**替代方案**: 每个用户独立数据库文件
- 文件管理复杂
- 备份和迁移困难
- 连接池管理复杂

### 3. 前端架构

**决策**: 保留 React + Vite，移除 Electron

**变更**:
- `src/renderer/` → `src/web/`
- 移除 IPC 调用，改为 HTTP API
- 使用 `axios` 或 `fetch` 进行 API 调用
- 使用 `zustand` 管理全局状态（包括用户会话）

**API 客户端封装**:
```typescript
// src/web/api/client.ts
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
});
```

### 4. 后端架构

**决策**: 保留 Express，扩展认证中间件

**目录结构**:
```
src/server/
├── index.ts              # 入口，启动 HTTP + WebSocket
├── routes/
│   ├── auth.routes.ts    # 登录、注册、刷新 Token
│   ├── users.routes.ts   # 用户管理（管理员）
│   └── ...existing routes（增加认证检查）
├── middleware/
│   └── auth.middleware.ts # JWT 验证
├── services/
│   └── auth.service.ts   # 认证逻辑
└── ...existing
```

### 5. AI 提供商配置存储

**决策**: 存储在数据库 configs 表，按用户隔离

**配置结构**:
```typescript
interface AIProviderConfig {
  provider: 'anthropic' | 'openai' | 'custom';
  apiKey: string;        // 明文存储（内部部署场景）
  apiUrl?: string;       // 自定义 API 地址
  model: string;
  userId: string;        // 归属用户
}
```

**理由**:
- 用户可独立配置自己的 AI 提供商
- 管理员可设置系统默认值
- 内部部署场景，明文存储简化实现

### 6. 文件操作迁移

**决策**: 文件操作移至后端，通过 API 暴露

**API 设计**:
```typescript
// 文件列表
GET /api/v1/files?spaceId={id}&path={path}

// 读取文件
GET /api/v1/files/content?spaceId={id}&path={path}

// 写入文件
POST /api/v1/files/content
Body: { spaceId, path, content }

// 执行命令（受限制）
POST /api/v1/terminal/execute
Body: { spaceId, command, args }
```

**安全措施**:
- 命令执行白名单（仅允许 git、npm 等安全命令）
- 路径验证（防止目录遍历）
- 超时限制

## Risks / Trade-offs

### [Risk] 浏览器环境限制
- **问题**: 无法执行本地命令、无法直接访问文件系统
- **缓解**: 所有操作通过后端 API；对于开发场景，后端运行在本地机器上

### [Risk] API Key 安全
- **问题**: AI 提供商 API Key 明文存储在服务器
- **缓解**:
  - 内部部署场景，信任网络环境
  - 支持用户选择使用环境变量（不存储在数据库）
  - 数据库文件权限控制（仅运行用户可访问）

### [Risk] 性能下降
- **问题**: 从本地 IPC 变为 HTTP 网络调用，延迟增加
- **缓解**:
  - 单机部署时后端监听 localhost，延迟极低
  - WebSocket 保持长连接，减少握手开销
  - 合理的缓存策略

### [Risk] 单用户改造成多用户的数据迁移
- **问题**: 现有用户数据没有 user_id
- **缓解**:
  - 创建默认管理员用户
  - 迁移脚本将现有数据归属给管理员
  - 首次启动时执行迁移

## Migration Plan

### Phase 1: 后端改造
1. 添加用户认证模块（users 表、JWT、登录 API）
2. 添加认证中间件，保护现有 API
3. 修改数据访问层，增加 user_id 过滤
4. 迁移脚本：为现有数据添加默认用户

### Phase 2: 前端改造
1. 创建新的 Web 入口（Vite 配置）
2. 实现登录页面
3. 替换 IPC 调用为 HTTP API
4. 移除 Electron 相关代码

### Phase 3: 清理
1. 移除 Electron 依赖
2. 更新构建脚本
3. 更新文档

### Rollback
- 保留 Git 历史，可随时回滚
- 数据库变更使用迁移脚本，可逆向执行

## Open Questions

1. **是否支持 OAuth（GitHub/Google 登录）？**
   - 建议：Phase 2 再实现，先支持邮箱密码

2. **是否保留桌面端体验？**
   - 建议：可用 PWA 或 Tauri 替代 Electron（更轻量）

3. **多用户同时编辑冲突如何处理？**
   - 建议：先实现简单的乐观锁（version 字段），后续考虑实时协作

4. **文件上传大小限制？**
   - 建议：默认 10MB，可配置
