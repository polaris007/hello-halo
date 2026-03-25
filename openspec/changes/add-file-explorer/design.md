## Context

BS 架构重构后，SpacePage 布局为：左侧 ChatView + 右侧 ContentCanvas。用户缺少浏览空间文件的能力。

现有的相关组件：
- `files.routes.ts`：已有文件列表 API (`GET /spaces/:spaceId/files`)，返回目录内容
- `ContentCanvas`：内容展示区，支持标签页
- `CodeViewer`：CodeMirror 6 代码查看器，支持 20+ 语言语法高亮
- `MarkdownViewer`：Streamdown Markdown 渲染器
- `CanvasLifecycle`：管理 canvas tab 的打开、关闭、切换

## Goals / Non-Goals

**Goals:**
- 用户可浏览空间目录结构（树形展示）
- 点击文件在 ContentCanvas 中打开对应 viewer
- 支持目录展开/折叠
- 显示文件图标（根据扩展名）

**Non-Goals:**
- 文件编辑功能（只读浏览）
- 文件上传/删除功能
- 文件搜索功能
- 文件监听实时更新

## Decisions

### 1. 组件结构

```
src/web/components/file-explorer/
├── FileExplorer.tsx      # 主容器组件
├── FileTree.tsx          # 文件树组件
├── FileIcon.tsx          # 文件图标组件
└── useFileExplorer.ts    # 自定义 hook（状态管理）
```

**理由**：职责分离，FileTree 专注渲染，FileExplorer 处理布局和集成。

**替代方案**：单文件组件 - 代码量大时难以维护

### 2. 状态管理

使用 React local state + Zustand canvas store，不创建新的全局 store。

```
┌─────────────────────────────────────────┐
│           FileExplorer (local)          │
│  - currentPath: 当前浏览路径             │
│  - expandedDirs: Set<string> 展开的目录  │
│  - files: FileEntry[] 当前目录内容       │
└─────────────────────────────────────────┘
                    │
                    │ 点击文件
                    ▼
┌─────────────────────────────────────────┐
│         CanvasLifecycle (global)         │
│  - openFile(path, type) → 打开 tab       │
└─────────────────────────────────────────┘
```

**理由**：文件浏览状态不需要跨组件共享，canvas 状态已有全局管理。

### 3. API 设计

新增文件内容读取 API：

```
GET /api/v1/spaces/:spaceId/files/content?path=<relativePath>

Response:
{
  "success": true,
  "data": {
    "content": "文件文本内容",
    "mimeType": "text/markdown",
    "size": 1234,
    "language": "markdown"
  }
}
```

**理由**：现有下载 API 返回文件流，前端需要文本内容用于 viewer 展示。

**替代方案**：前端使用 fetch + text() 解析下载响应 - 额外网络请求，不够高效

### 4. 文件类型检测

使用文件扩展名映射到 viewer 类型：

```typescript
const FILE_TYPE_MAP: Record<string, { viewer: string; language?: string }> = {
  '.md': { viewer: 'markdown' },
  '.ts': { viewer: 'code', language: 'typescript' },
  '.tsx': { viewer: 'code', language: 'typescript' },
  '.js': { viewer: 'code', language: 'javascript' },
  '.json': { viewer: 'json' },
  '.css': { viewer: 'code', language: 'css' },
  '.html': { viewer: 'html' },
  '.png': { viewer: 'image' },
  // ...
}
```

**理由**：简单直接，复用现有的 file-types.ts 常量。

### 5. 布局集成

FileExplorer 放置在 SpacePage 右侧，与 ChatView 并列：

```
┌─────────────────────────────────────────────────────────────┐
│                        Header                                │
├──────────────────┬──────────────────────┬───────────────────┤
│                  │                      │                   │
│   ChatView       │    ContentCanvas     │   FileExplorer    │
│   (flexible)     │    (flexible)        │   (fixed 240px)   │
│                  │                      │                   │
└──────────────────┴──────────────────────┴───────────────────┘
```

**理由**：与原桌面应用布局一致，用户习惯不变。

## Risks / Trade-offs

### 风险 1：大文件加载性能
- **风险**：用户点击大文件（如 10MB 日志）可能导致页面卡顿
- **缓解**：设置文件大小限制（如 1MB），超过限制提示用户下载查看

### 风险 2：目录层级过深
- **风险**：深层目录结构导致文件树难以导航
- **缓解**：当前只支持单层展开，未来可考虑面包屑导航

### 风险 3：二进制文件处理
- **风险**：用户点击图片、PDF 等二进制文件
- **缓解**：图片使用 ImageViewer，其他二进制文件提示「不支持预览」并提供下载

## Open Questions

1. 是否需要记住用户展开的目录状态？(localStorage)
2. 是否支持文件路径复制功能？
3. 隐藏文件（.开头）是否显示？

**决策**：MVP 阶段暂不实现，后续迭代按需添加。
