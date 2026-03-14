# Web Frontend

## Purpose

TBD - Web 前端应用，提供用户界面和与后端 API 的交互。

## Requirements

### Requirement: 认证页面

系统 SHALL 提供登录和注册页面。

#### Scenario: 登录页面
- **WHEN** 未认证用户访问应用
- **THEN** 系统重定向到登录页面
- **AND** 页面包含邮箱和密码字段
- **AND** 包含注册页面链接

#### Scenario: 注册页面
- **WHEN** 用户点击"注册"链接
- **THEN** 系统显示注册表单
- **AND** 包含邮箱、密码、确认密码字段
- **AND** 提交前验证输入

#### Scenario: 登录后重定向
- **WHEN** 用户成功登录
- **THEN** 系统将 JWT token 存储在 localStorage
- **AND** 重定向到主应用页面
- **AND** 加载用户的空间和对话

### Requirement: 带认证的 API 客户端

系统 SHALL 为所有后端调用提供带认证的 API 客户端。

#### Scenario: 在请求中包含 Token
- **WHEN** 前端发起 API 调用
- **THEN** 客户端在 Authorization 头中包含 Bearer token
- **AND** 发送请求到 /api/v1/* 端点

#### Scenario: 处理 Token 过期
- **WHEN** API 返回 401 并带有 "TOKEN_EXPIRED" 代码
- **THEN** 客户端尝试刷新 token
- **AND** 重试原始请求

#### Scenario: 认证失败时重定向
- **WHEN** token 刷新失败
- **THEN** 客户端重定向到登录页面
- **AND** 清除存储的 token

### Requirement: 移除 Electron 依赖

系统 SHALL 移除所有 Electron 特定代码。

#### Scenario: 移除 IPC 调用
- **WHEN** 应用初始化
- **THEN** 没有代码调用 window.electron.ipcRenderer
- **AND** 所有 IPC 调用被 HTTP API 调用替换

#### Scenario: 移除 preload 引用
- **WHEN** 应用在浏览器中运行
- **THEN** 没有代码引用 window.electron
- **AND** 所有 Electron API 被 Web 等价物替换

#### Scenario: 通过 API 进行文件操作
- **WHEN** 用户执行文件操作
- **THEN** 前端调用 /api/v1/files/* 端点
- **AND** 不使用 Node.js fs 模块

### Requirement: 通过 WebSocket 实时更新

系统 SHALL 使用 WebSocket 进行实时更新。

#### Scenario: 连接 WebSocket
- **WHEN** 应用加载
- **THEN** 前端建立到 /ws 的 WebSocket 连接
- **AND** 在连接握手时包含 JWT token

#### Scenario: 接收 Agent 事件
- **WHEN** 后端发送 Agent 事件
- **THEN** 前端通过 WebSocket 接收
- **AND** 相应地更新 UI

#### Scenario: 断开时重连
- **WHEN** WebSocket 连接断开
- **THEN** 前端尝试使用指数退避重连
- **AND** 重连后恢复接收事件

### Requirement: 用户设置页面

系统 SHALL 提供用户配置设置页面。

#### Scenario: AI 提供商设置
- **WHEN** 用户导航到设置 > AI 提供商
- **THEN** 页面显示当前 AI 提供商配置
- **AND** 允许编辑提供商、模型、apiKey
- **AND** 包含"测试连接"按钮

#### Scenario: 个人资料设置
- **WHEN** 用户导航到设置 > 个人资料
- **THEN** 页面显示用户信息
- **AND** 允许修改姓名和密码

### Requirement: 管理员仪表板

系统 SHALL 为管理员提供管理员仪表板。

#### Scenario: 访问管理员仪表板
- **WHEN** 管理员用户点击导航中的"管理员"
- **THEN** 系统显示管理员仪表板
- **AND** 包含用户管理、系统配置、活动日志

#### Scenario: 非管理员访问被拒绝
- **WHEN** 非管理员用户尝试访问 /admin 路由
- **THEN** 系统重定向到主页面
- **AND** 显示"访问被拒绝"消息

## Removed Requirements

### Requirement: AI Browser
**原因**: 浏览器环境无法嵌入 BrowserView 进行 Web 自动化
**迁移**: 使用基于后端的 Web 爬虫或移除该功能

### Requirement: Artifact 预览
**原因**: 在纯 Web 环境中实现复杂
**迁移**: 使用简单的文件内容显示代替富预览

### Requirement: 原生系统集成
**原因**: 浏览器无法访问原生系统 API
**迁移**: 全局热键、系统托盘等功能在 Web 版本中不可用
