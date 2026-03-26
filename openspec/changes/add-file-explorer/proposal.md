## Why

BS 架构重构后，原有的 ArtifactRail 组件被移除，用户无法直观浏览服务器上空间目录里的文件。用户需要手动浏览空间文件的能力，包括查看目录结构、点击文件查看内容（Markdown 格式化展示、代码语法高亮）。

此外，发现现有 `files.routes.ts` 存在**路径遍历安全漏洞**，用户可通过 `../` 访问空间目录外的文件，需要一并修复。

## What Changes

- 新增 `FileExplorer` 组件：右侧文件树浏览器，支持目录展开/折叠、文件图标显示
- 扩展后端 API：在 `files.routes.ts` 中新增文件内容读取和类型检测端点
- **安全修复**：添加路径边界验证，防止路径遍历攻击
- 集成到 `SpacePage`：替代原 ArtifactRail 位置，复用现有 ContentCanvas 和 Viewer 组件
- 点击文件时：调用 Canvas lifecycle 在 ContentCanvas 中打开对应 viewer

## Capabilities

### New Capabilities

- `file-explorer`: 空间文件浏览器能力，包括文件树展示、目录导航、文件内容预览

### Modified Capabilities

- `files-routes`: 文件 API 现在包含路径边界安全验证

## Impact

- **前端**：
  - 新增 `src/web/components/file-explorer/FileExplorer.tsx` 组件
  - 新增 `src/web/components/file-explorer/FileTree.tsx` 子组件
  - 修改 `src/web/pages/SpacePage.tsx` 集成 FileExplorer
  - **修改 `src/web/api/index.ts`**：将 `readArtifactContent` 和 `detectFileType` 改为调用 `/spaces/:spaceId/files/*` 端点

- **后端**：
  - **安全修复**：`files.routes.ts` 所有端点添加路径边界验证
  - 新增 `GET /api/v1/spaces/:spaceId/files/:path/content` API
  - 新增 `GET /api/v1/spaces/:spaceId/files/:path/detect-type` API

- **复用组件**：
  - `ContentCanvas` 和 `CanvasLifecycle`：内容展示区
  - `CodeViewer`：代码文件语法高亮
  - `MarkdownViewer`：Markdown 格式化展示
  - 其他 viewer（Image、JSON、CSV 等）
