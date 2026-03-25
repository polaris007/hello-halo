## Why

BS 架构重构后，原有的 ArtifactRail 组件被移除，用户无法直观浏览服务器上空间目录里的文件。用户需要手动浏览空间文件的能力，包括查看目录结构、点击文件查看内容（Markdown 格式化展示、代码语法高亮）。

## What Changes

- 新增 `FileExplorer` 组件：右侧文件树浏览器，支持目录展开/折叠、文件图标显示
- 新增后端 API：读取文件文本内容，用于前端展示
- 集成到 `SpacePage`：替代原 ArtifactRail 位置，复用现有 ContentCanvas 和 Viewer 组件
- 点击文件时：调用 Canvas lifecycle 在 ContentCanvas 中打开对应 viewer

## Capabilities

### New Capabilities

- `file-explorer`: 空间文件浏览器能力，包括文件树展示、目录导航、文件内容预览

### Modified Capabilities

无（这是新增功能，不修改现有 spec 的需求）

## Impact

- **前端**：
  - 新增 `src/web/components/file-explorer/FileExplorer.tsx` 组件
  - 新增 `src/web/components/file-explorer/FileTree.tsx` 子组件
  - 修改 `src/web/pages/SpacePage.tsx` 集成 FileExplorer
  - 新增 API 调用方法

- **后端**：
  - 新增 `GET /api/v1/spaces/:spaceId/files/:path/content` API

- **复用组件**：
  - `ContentCanvas` 和 `CanvasLifecycle`：内容展示区
  - `CodeViewer`：代码文件语法高亮
  - `MarkdownViewer`：Markdown 格式化展示
  - 其他 viewer（Image、JSON、CSV 等）
