# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码仓库中工作时提供指导。

## 项目概述

Halo 是一个带有可视化界面的开源 AI 编程助手。它将 Claude Code 的 Agent 能力封装为跨平台的桌面体验，并支持远程访问。架构已从 Electron 迁移到浏览器-服务器模式。

## 开发命令

```bash
# 开发模式（同时运行服务器和客户端）
npm run dev

# 开发模式（单独运行）
npm run dev:server   # 服务器运行在 3000 端口
npm run dev:client   # Vite 开发服务器运行在 5173 端口

# 构建
npm run build        # 同时构建服务器和客户端
npm run build:server # TypeScript 编译
npm run build:client # Vite 构建

# 生产环境
npm run start        # 从 dist/server/index.js 运行

# 测试
npm run test                    # 运行所有测试
npm run test:check              # 构建前二进制依赖验证
npm run test:unit               # Vitest 单元测试
npm run test:unit:watch         # Vitest 监视模式
npm run test:e2e                # Playwright E2E 测试
npm run test:e2e:headed         # 可视化浏览器 E2E 测试

# 国际化
npm run i18n          # 提取并翻译 i18n 字符串

# 打包
npm run package       # 为当前平台打包
npm run package:win   # Windows x64
npm run package:linux # Linux x64
npm run package:mac   # macOS x64
```

## 架构

```
src/
├── server/           # Express 服务器后端
│   ├── services/     # 核心业务逻辑
│   ├── routes/       # HTTP API 路由
│   ├── middleware/   # Express 中间件
│   └── utils/        # 服务器工具
├── web/              # React 前端
│   ├── components/   # UI 组件
│   ├── pages/        # 页面组件
│   ├── stores/       # Zustand 状态管理
│   ├── api/          # API 客户端
│   └── i18n/         # 国际化
├── shared/           # 共享类型和工具
└── worker/           # 工作进程
```

### 分层模型

- **用户交互层**: 渲染器页面/组件/状态管理
- **应用层** (`src/server/services/apps/`): App 规范、管理器、运行时
- **平台层** (`src/server/services/platform/`): 存储 (SQLite)、调度器、事件总线、内存、后台服务
- **服务层**: 领域服务 (agent, ai-browser, space, conversation, remote)

### 依赖方向

依赖仅向下流动: `UI -> apps -> platform -> services/utilities`

## 技术栈

- **服务器**: Express 5, TypeScript, SQLite (better-sqlite3), SSE (Server-Sent Events)
- **客户端**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **AI**: Claude Agent SDK, Anthropic SDK
- **测试**: Vitest (单元测试), Playwright (E2E 测试)

## 代码规范

### 国际化

所有面向用户的文本必须使用 `t('English text')`:

```tsx
// 正确
<Button>{t('Save')}</Button>

// 错误 - 硬编码文本会破坏国际化
<Button>Save</Button>
```

提交前运行 `npm run i18n` 提取并翻译新字符串。

### 样式

使用 Tailwind CSS 主题变量，不要使用硬编码颜色:

```tsx
// 正确
<div className="bg-background text-foreground border-border">

// 错误
<div className="bg-white text-black border-gray-200">
```

### 语言规范

- 代码: 英文
- 注释: 优先使用中文
- 提交信息: 优先使用英文
- 面向用户的文本: 使用 `t()` 并以英文为键（翻译自动生成）

## 添加 API 端点

添加新的 API 端点时:

1. 在 `src/server/routes/` 中添加路由处理器
2. 在 `src/web/api/` 中添加客户端 API 方法
3. 如需要，在 `src/shared/` 中更新共享类型
4. 为端点添加测试

## 测试

- **单元测试**: `tests/unit/` - 使用 `.test.ts` 扩展名
- **E2E 测试**: `tests/e2e/specs/` - 使用 `.spec.ts` 扩展名
- **构建前检查**: `tests/check/` - 验证二进制依赖

运行指定测试: `npm run test:unit -- tests/unit/services/space.test.ts`

## 关键文件

- `vite.config.ts` - 客户端构建配置，开发服务器代理到后端
- `tsconfig.server.json` - 服务器 TypeScript 配置
- `tsconfig.web.json` - 客户端 TypeScript 配置
- `.env.example` - 环境变量模板

## 架构约束

- **模块化优先**: 按模块和层隔离职责
- **性能保障**: 不允许启动/运行时/内存性能回退
- **本地优先**: 核心功能不依赖云后端
- **安全规范**: 永远不要在代码、日志或文档中暴露密钥/令牌
