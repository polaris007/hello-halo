# CLAUDE.md

## 项目概述

Halo 是开源 AI 编程助手，将 Claude Code Agent 封装为跨平台桌面体验，支持远程访问。采用浏览器-服务器架构。

## 开发命令

```bash
npm run dev          # 开发模式
npm run build        # 构建
npm run test         # 运行所有测试
npm run i18n         # 国际化提取翻译
npm run package      # 打包
```

## 架构

```
src/server/    # Express 后端 (services/routes/middleware)
src/web/       # React 前端 (components/pages/stores)
src/shared/    # 共享类型和工具
src/worker/    # 工作进程
```

分层依赖: `UI -> apps -> platform -> services`

## 技术栈

- **服务器**: Express 5, TypeScript, SQLite (better-sqlite3), SSE (Server-Sent Events)
- **客户端**: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- **AI**: Claude Agent SDK
- **测试**: Vitest (单元测试), Playwright (E2E 测试)

## 代码规范

- 国际化: 用户文本必须使用 `t('English text')`
- 样式: 使用 Tailwind 主题变量，禁止硬编码颜色
- 语言: 代码英文，注释中文，提交信息英文
- 安全: 禁止暴露密钥/令牌

## 测试

- 单元测试: `tests/unit/*.test.ts`
- E2E 测试: `tests/e2e/specs/*.spec.ts`
