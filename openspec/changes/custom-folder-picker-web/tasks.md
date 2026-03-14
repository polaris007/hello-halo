## 1. 后端文件系统 API

- [x] 1.1 创建 `src/server/routes/filesystem.routes.ts`，实现 `GET /api/v1/filesystem/roots` 端点：检测操作系统类型，Windows 返回可用盘符列表，Linux/Mac 返回根目录 `/`，同时返回用户主目录作为快捷入口
- [x] 1.2 在 `filesystem.routes.ts` 中实现 `GET /api/v1/filesystem/browse` 端点：接收 `path` 和 `showHidden` 查询参数，使用 `fs.readdirSync` 读取子目录列表，只返回目录类型条目，按名称排序，最多返回 500 条并标记 `truncated`
- [x] 1.3 在 `filesystem.routes.ts` 中添加安全检查：路径规范化（`path.resolve`）、存在性检查（`fs.existsSync`）、权限检查（`fs.accessSync`）、目录类型检查（`fs.statSync`），返回对应错误码
- [x] 1.4 在 `src/server/index.ts` 中注册 `filesystem.routes.ts` 路由，挂载到 `/api/v1/filesystem` 路径，添加 `authMiddleware`

## 2. 后端空间创建支持 customPath

- [x] 2.1 修改 `src/server/routes/spaces.routes.ts` 的 `POST /api/v1/spaces` 端点：从 `req.body` 读取 `customPath` 参数，验证路径存在且是目录且可读，将其存入数据库
- [x] 2.2 修改 spaces 表结构：在 `src/server/utils/database.ts` 中为 `spaces` 表添加 `working_dir` 列（TEXT, nullable），用于存储自定义路径
- [x] 2.3 修改空间查询 API（`GET /api/v1/spaces` 和 `GET /api/v1/spaces/:id`），在返回数据中包含 `working_dir` 字段

## 3. 前端 API 层修改

- [x] 3.1 修改 `src/renderer/api/index.ts`：新增 `getFilesystemRoots()` 方法，调用 `GET /api/v1/filesystem/roots`
- [x] 3.2 修改 `src/renderer/api/index.ts`：新增 `browseFilesystem(path, showHidden?)` 方法，调用 `GET /api/v1/filesystem/browse`
- [x] 3.3 修改 `src/renderer/api/index.ts`：更新 `selectFolder()` 方法，在 Web 模式下打开前端文件夹选择器（通过回调或 Promise 模式），而非返回失败

## 4. 前端文件夹选择器组件

- [x] 4.1 创建 `src/renderer/components/space/ServerFolderPicker.tsx` 组件：实现模态对话框 UI，包含路径面包屑、目录列表、加载状态、选择/取消按钮。所有用户可见文本使用 `t()` 包裹
- [x] 4.2 在 `ServerFolderPicker` 中实现目录浏览逻辑：打开时调用 `getFilesystemRoots()` 显示根路径列表，点击目录时调用 `browseFilesystem()` 加载子目录
- [x] 4.3 在 `ServerFolderPicker` 中实现面包屑导航：解析当前路径为层级段，点击任意层级跳转到对应目录
- [x] 4.4 在 `ServerFolderPicker` 中实现手动输入路径功能：路径输入框支持用户直接输入路径并按回车导航
- [x] 4.5 在 `ServerFolderPicker` 中实现隐藏目录切换开关：控制 `showHidden` 参数，切换后重新加载当前目录

## 5. 前端创建空间对话框集成

- [x] 5.1 修改 `src/renderer/pages/HomePage.tsx`：移除 Web 模式下对自定义文件夹选项的禁用逻辑（移除 `isWebMode` 相关的 disabled 和 opacity 限制）
- [x] 5.2 修改 `HomePage.tsx` 的 `handleSelectFolder` 函数：在 Web 模式下打开 `ServerFolderPicker` 组件，接收选择结果
- [x] 5.3 在 `HomePage.tsx` 中添加 `ServerFolderPicker` 的状态管理（`showFolderPicker` 状态、`onSelect` 和 `onCancel` 回调）
- [x] 5.4 确保选择自定义路径后自动提取目录名作为空间名称建议值（复用现有逻辑，适配服务端路径格式）

## 7. 新建目录功能

- [x] 7.1 在 `src/server/routes/filesystem.routes.ts` 中新增 `POST /api/v1/filesystem/mkdir` 端点：接收 `path` 参数，使用 `path.resolve()` 规范化路径，检查目录是否已存在（返回 `DIR_ALREADY_EXISTS`），检查父目录写入权限（返回 `PERMISSION_DENIED`），使用 `mkdirSync({ recursive: true })` 创建目录
- [x] 7.2 在 `src/renderer/api/index.ts` 中新增 `createDirectory(path: string)` 方法，调用 `POST /api/v1/filesystem/mkdir`
- [x] 7.3 在 `ServerFolderPicker.tsx` 中添加"新建文件夹"功能：在目录列表顶部（非根路径时）显示"新建文件夹"按钮，点击后显示内联输入框，用户输入名称后按回车调用 API 创建，创建成功后刷新当前目录并选中新建的文件夹。支持 Esc 取消
- [x] 7.4 在 `ServerFolderPicker.tsx` 中处理新建目录的错误场景：已存在时提示"文件夹已存在"，权限不足时提示"没有写入权限"

## 8. 路径可编辑功能

- [x] 8.1 修改 `src/renderer/pages/HomePage.tsx` 创建空间对话框：选择"自定义文件夹"选项后，显示一个可编辑的路径输入框（替代当前只读的路径显示）。输入框右侧保留"浏览"按钮打开 `ServerFolderPicker`
- [x] 8.2 修改 `HomePage.tsx` 的状态管理：`customPath` 状态与路径输入框双向绑定。用户可直接输入完整路径，也可通过选择器回填路径后再修改
- [x] 8.3 修改 `HomePage.tsx` 的创建按钮启用逻辑：当 `useCustomPath` 为 true 时，只要路径输入框非空即可创建（移除 `!customPath` 的禁用条件，改为检查输入框内容非空）

## 9. 不存在路径自动创建

- [x] 9.1 修改 `src/server/routes/spaces.routes.ts` 的 `POST /api/v1/spaces`：当 `customPath` 不存在时，不再返回 `INVALID_PATH` 错误，而是尝试使用 `mkdirSync({ recursive: true })` 自动创建目录。创建失败时返回 `PATH_CREATE_FAILED` 错误
- [x] 9.2 修改路径验证逻辑：如果路径不存在则尝试创建，创建后再进行类型检查和权限检查。如果路径已存在但不是目录或无读取权限，仍返回原有错误

## 10. 验证与测试（增补）

- [ ] 10.1 手动测试：在 ServerFolderPicker 中新建文件夹，验证创建成功、名称冲突、权限不足的提示
- [ ] 10.2 手动测试：在创建空间对话框中直接输入完整路径（不使用选择器），验证空间创建成功
- [ ] 10.3 手动测试：选择路径后修改路径输入框内容，验证使用修改后的路径创建空间
- [ ] 10.4 手动测试：输入不存在的路径创建空间，验证目录自动创建且空间工作目录正确设置
- [x] 10.5 运行 `npm run i18n` 提取和翻译新增的国际化文本

## 6. 验证与测试

- [ ] 6.1 手动测试：在 Windows 服务端上验证盘符列表返回、目录浏览、路径分隔符显示
- [ ] 6.2 手动测试：验证不存在路径、无权限路径、文件路径等错误场景的提示信息
- [ ] 6.3 手动测试：验证使用自定义路径创建空间后，空间的工作目录正确设置
- [ ] 6.4 手动测试：验证大目录（超过 500 个子目录）的截断行为
- [x] 6.5 运行 `npm run i18n` 提取和翻译新增的国际化文本
