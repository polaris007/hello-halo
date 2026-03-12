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
- [ ] 2.4 移除第三方 AI 提供商认证代码（腾讯、千问、Kiro、Github 等）
- [ ] 2.5 实现可配置的用户认证中间件

## 3. 用户认证系统

- [ ] 3.1 创建用户表（users）
- [ ] 3.2 创建会话表（sessions）
- [ ] 3.3 实现用户登录 API：POST /api/v1/auth/login
- [ ] 3.4 实现用户登出 API：POST /api/v1/auth/logout
- [ ] 3.5 实现会话验证中间件
- [ ] 3.6 实现默认用户创建逻辑
- [ ] 3.7 实现账户锁定机制（连续失败 5 次）
- [ ] 3.8 实现密码加密存储（bcrypt）

## 4. 系统对接认证

- [ ] 4.1 实现认证模式配置读取
- [ ] 4.2 实现 disabled 模式（禁用认证，使用默认用户）
- [ ] 4.3 实现 simple 模式（固定 Token）
- [ ] 4.4 实现 header 模式（请求头认证）
- [ ] 4.5 实现认证配置 API：GET /api/v1/auth/config

## 5. 多租户数据隔离

- [ ] 5.1 设计数据库多租户 Schema（添加 user_id 字段）
- [ ] 5.2 创建数据库迁移脚本，为现有表添加 user_id
- [ ] 5.3 实现用户数据隔离中间件
- [ ] 5.4 更新所有查询自动添加 user_id 过滤
- [ ] 5.5 更新所有插入自动填充 user_id
- [ ] 5.6 实现用户空间目录结构：`~/.halo/users/{user_id}/spaces/`
- [ ] 5.7 实现文件系统访问控制
- [ ] 5.8 为现有数据关联默认用户

## 6. AI 提供商配置

- [ ] 6.1 设计 AI 提供商配置文件格式
- [ ] 6.2 实现配置文件读写服务
- [ ] 6.3 更新 AI 提供商管理 API（移除第三方认证）
- [ ] 6.4 支持环境变量配置 API Key
- [ ] 6.5 更新前端 AI 提供商配置界面

## 7. HTTP API 扩展

- [ ] 7.1 补充缺失的空间管理 API
- [ ] 7.2 补充缺失的配置管理 API
- [ ] 7.3 实现文件上传 API：POST /api/v1/spaces/:id/files
- [ ] 7.4 实现文件下载 API：GET /api/v1/spaces/:id/files/:path
- [ ] 7.5 添加健康检查端点：GET /health、GET /ready

## 8. WebSocket 改造

- [ ] 8.1 实现 WebSocket 连接时的 Token 验证
- [ ] 8.2 适配系统对接认证模式
- [ ] 8.3 确保事件推送按用户隔离

## 9. 前端改造

- [ ] 9.1 删除 IPC 相关代码和类型定义
- [ ] 9.2 修改 API 层：移除 IPC transport，只保留 HTTP transport
- [ ] 9.3 创建登录页面组件
- [ ] 9.4 创建登录状态管理 store
- [ ] 9.5 实现登录重定向逻辑
- [ ] 9.6 支持认证禁用模式下的登录页面隐藏
- [ ] 9.7 更新所有 API 调用添加 Authorization 头
- [ ] 9.8 移除 AI Browser 相关 UI 组件
- [ ] 9.9 移除产物展示相关 UI 组件
- [ ] 9.10 更新路由配置

## 10. 配置文件更新

- [ ] 10.1 设计新的服务端配置文件格式（server.json）
- [ ] 10.2 整合认证配置
- [ ] 10.3 整合 AI 提供商配置
- [ ] 10.4 提供配置迁移脚本

## 11. 部署配置

- [ ] 11.1 创建 Dockerfile
- [ ] 11.2 创建 docker-compose.yml
- [ ] 11.3 配置 pkg/nexe 打包为独立可执行文件
- [ ] 11.4 创建服务启动脚本（systemd、pm2）

## 12. 文档和测试

- [ ] 12.1 更新 README.md
- [ ] 12.2 编写部署文档
- [ ] 12.3 编写认证模式说明文档
- [ ] 12.4 编写多租户数据隔离说明文档
- [ ] 12.5 编写 AI 提供商配置文档
- [ ] 12.6 编写认证相关测试
- [ ] 12.7 编写数据隔离相关测试
