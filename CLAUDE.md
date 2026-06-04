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

## gstack
本项目使用 gstack 技能集增强开发体验。
### Web 浏览
使用 `/gstack-browse` skill 进行所有 web 浏览和 QA 测试，**禁止使用** `mcp__claude-in-chrome__*` 工具。
### 可用技能
| 技能 | 用途 |
|------|------|
| `/gstack-office-hours` | YC Office Hours — 产品创意验证 |
| `/gstack-plan-ceo-review` | CEO/创始人模式计划评审 |
| `/gstack-plan-eng-review` | 工程经理模式计划评审 |
| `/gstack-plan-design-review` | 设计师视角计划评审 |
| `/gstack-plan-devex-review` | 开发者体验计划评审 |
| `/gstack-design-consultation` | 设计系统咨询 |
| `/gstack-design-shotgun` | 生成多个设计变体 |
| `/gstack-design-html` | 生产级 HTML/CSS 生成 |
| `/gstack-design-review` | 视觉一致性审查 |
| `/gstack-review` | PR 预审查 |
| `/gstack-ship` | 发布工作流 |
| `/gstack-land-and-deploy` | 合并部署 |
| `/gstack-canary` | 生产环境监控 |
| `/gstack-benchmark` | 性能回归检测 |
| `/gstack-browse` | 无头浏览器 QA 测试 |
| `/gstack-connect-chrome` | 连接真实 Chrome |
| `/gstack-qa` | 系统 QA 测试并修复 |
| `/gstack-qa-only` | 仅报告 QA 测试 |
| `/gstack-setup-browser-cookies` | 导入浏览器 cookies |
| `/gstack-setup-deploy` | 配置部署设置 |
| `/gstack-retro` | 周工程回顾 |
| `/gstack-investigate` | 系统化调试 |
| `/gstack-document-release` | 发布后文档更新 |
| `/gstack-codex` | OpenAI Codex CLI |
| `/gstack-cso` | 安全审计 |
| `/gstack-autoplan` | 自动评审流水线 |
| `/gstack-careful` | 危险命令警告 |
| `/gstack-freeze` | 限制编辑目录 |
| `/gstack-guard` | 安全模式 |
| `/gstack-unfreeze` | 解除目录限制 |
| `/gstack-upgrade` | 升级 gstack |
| `/gstack-learn` | 管理项目经验 |


