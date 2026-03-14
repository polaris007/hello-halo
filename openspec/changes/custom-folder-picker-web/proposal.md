## Why

在 B/S 架构模式下，创建空间时无法选择自定义文件夹作为工作目录。当前的文件夹选择功能依赖 Electron 的 `dialog.showOpenDialog()` 原生对话框，在 Web 模式下被硬编码为不可用（`selectFolder` 直接返回失败）。这导致 Web 用户只能使用默认路径创建空间，无法将空间关联到服务端已有的项目目录。

由于 B/S 架构中浏览器无法直接访问服务端文件系统，需要提供一个服务端目录浏览 API，让前端通过 HTTP 请求来浏览和选择服务端的文件夹路径。服务端可能运行在 Linux、Windows、Mac 上，需要兼容不同操作系统的路径格式和文件系统特性。

## What Changes

- 新增服务端目录浏览 API（`GET /api/v1/filesystem/browse`），支持列出指定路径下的子目录
- 新增服务端磁盘根目录 API（`GET /api/v1/filesystem/roots`），返回可用的磁盘根路径（Windows 返回盘符列表，Linux/Mac 返回 `/`）
- 前端新增服务端文件夹选择器组件（`ServerFolderPicker`），替代 Electron 的原生文件夹对话框
- 修改 `api.selectFolder()` 在 Web 模式下调用新的服务端 API 而非返回失败
- 修改 `HomePage.tsx` 创建空间对话框，在 Web 模式下启用自定义文件夹选择
- 修改 `spaces.routes.ts`，支持创建空间时传入 `customPath` 参数
- 新增服务端创建目录 API（`POST /api/v1/filesystem/mkdir`），支持在选择器中新建文件夹
- 前端 `ServerFolderPicker` 支持新建文件夹功能
- 选择文件夹后路径可在创建空间对话框中直接编辑或手动输入完整路径
- 创建空间时如果 `customPath` 不存在，服务端自动创建目录

## Capabilities

### New Capabilities
- `server-folder-picker`: 服务端文件系统浏览能力，包括目录列表 API、磁盘根路径 API，以及前端文件夹选择器 UI 组件。支持 Windows/Linux/Mac 跨平台路径处理。

### Modified Capabilities
- `server-folder-picker`: 增强文件夹选择器，增加新建目录、路径手动输入/编辑功能。创建空间时支持不存在路径的自动创建。

## Impact

- **后端 API**: 新增 `src/server/routes/filesystem.routes.ts` 路由文件，注册到 Express 路由
- **前端 API**: 修改 `src/renderer/api/index.ts` 的 `selectFolder` 方法
- **前端组件**: 新增 `src/renderer/components/space/ServerFolderPicker.tsx` 组件
- **前端页面**: 修改 `src/renderer/pages/HomePage.tsx` 支持 Web 模式下的文件夹选择
- **后端空间路由**: 修改 `src/server/routes/spaces.routes.ts` 支持 `customPath` 参数，不存在时自动创建目录
- **后端文件系统 API**: 新增 `POST /api/v1/filesystem/mkdir` 端点支持新建目录
- **前端页面**: 修改 `HomePage.tsx` 支持路径输入框可编辑
- **安全性**: 需要考虑目录遍历攻击防护，限制可浏览的路径范围；mkdir 端点需要认证和路径规范化
- **跨平台**: 路径分隔符（`/` vs `\`）、磁盘根路径（Windows 盘符 vs Unix `/`）、权限检查等
