## 1. 项目结构重构

- [ ] 1.1 创建 `src/server/` 目录结构
- [ ] 1.2 更新 `package.json`：移除 Electron 依赖，添加服务端启动脚本
- [ ] 1.3 创建新的 Vite 配置文件 `vite.config.ts`（替换 electron-vite）
- [ ] 1.4 创建服务端入口文件 `src/server/index.ts`
- [ ] 1.5 删除 `src/preload/` 目录
- [ ] 1.6 删除 `electron.vite.config.ts`

## 2. 服务端核心功能

- [ ] 2.1 从 `src/main/` 提取服务层到 `src/server/services/`
- [ ] 2.2 移除 Electron 相关代码（BrowserWindow、app、ipcMain 等）
- [ ] 2.3 删除 AI Browser 服务（`src/main/services/ai-browser/`）
- [ ] 2.4 重构数据库层，添加 user_id 字段支持
- [ ] 2.5 实现用户认证中间件
- [ ] 2.6 实现会话管理服务
- [ ] 2.7 实现数据隔离查询过滤

## 3. HTTP API 扩展

- [ ] 3.1 创建认证相关 API：POST /api/v1/auth/login、POST /api/v1/auth/logout
- [ ] 3.2 创建用户管理 API：GET /api/v1/users、GET /api/v1/users/:id
- [ ] 3.3 补充缺失的空间管理 API
- [ ] 3.4 补充缺失的配置管理 API
- [ ] 3.5 实现文件上传 API：POST /api/v1/spaces/:id/files
- [ ] 3.6 实现文件下载 API：GET /api/v1/spaces/:id/files/:path
- [ ] 3.7 添加健康检查端点：GET /health、GET /ready

## 4. WebSocket 改造

- [ ] 4.1 实现 WebSocket 连接时的 Token 验证
- [ ] 4.2 为 WebSocket 连接绑定用户上下文
- [ ] 4.3 确保事件推送到正确的用户

## 5. 前端改造

- [ ] 5.1 删除 IPC 相关代码和类型定义
- [ ] 5.2 修改 API 层：移除 IPC transport，只保留 HTTP transport
- [ ] 5.3 创建登录页面组件
- [ ] 5.4 创建登录状态管理 store
- [ ] 5.5 实现登录重定向逻辑
- [ ] 5.6 更新所有 API 调用添加 Authorization 头
- [ ] 5.7 移除 AI Browser 相关 UI 组件
- [ ] 5.8 移除产物展示相关 UI 组件
- [ ] 5.9 更新路由配置

## 6. 数据库迁移

- [ ] 6.1 设计新的数据库 Schema（添加 user_id）
- [ ] 6.2 创建数据库迁移脚本
- [ ] 6.3 为现有数据设置默认 user_id
- [ ] 6.4 创建用户表
- [ ] 6.5 创建会话表

## 7. 默认用户机制

- [ ] 7.1 实现首次启动检测
- [ ] 7.2 实现默认用户创建逻辑
- [ ] 7.3 支持环境变量配置默认密码
- [ ] 7.4 支持配置文件设置默认密码

## 8. 静态文件服务

- [ ] 8.1 配置 Express 静态文件服务
- [ ] 8.2 实现 SPA 路由回退
- [ ] 8.3 配置静态资源缓存策略

## 9. 部署配置

- [ ] 9.1 创建 Dockerfile
- [ ] 9.2 创建 docker-compose.yml
- [ ] 9.3 配置 pkg/nexe 打包为独立可执行文件
- [ ] 9.4 创建服务启动脚本（systemd、pm2）

## 10. 文档和测试

- [ ] 10.1 更新 README.md
- [ ] 10.2 编写部署文档
- [ ] 10.3 编写 API 文档
- [ ] 10.4 编写用户认证相关测试
- [ ] 10.5 编写数据隔离相关测试
