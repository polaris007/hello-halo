# CLAUDE.md

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---


## 项目概述

Hello 是开源 AI 编程助手，将 Claude Code Agent 封装为跨平台桌面体验，支持远程访问。采用浏览器-服务器架构。

## 开发命令

```bash
npm run dev          # 开发模式
npm run build        # 构建
npm run test         # 运行所有测试
npm run i18n         # 国际化提取翻译
npm run package      # 打包
docker build -f docker/Dockerfile -t hello-server:1.0 . # 打镜像
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

## 注意事项
- patches目录下有自己编写的一些补丁，如果升级了Claude Agent SDK的版本，需要提供相应的补丁

