# Anthropic SDK 升级 - 实施计划

## 概述

升级 `@anthropic-ai/claude-agent-sdk` 从 v0.1.76 到 v0.2.89，同时引入
`resolved-sdk.ts` 抽象层统一 SDK 访问入口。

**目标版本**: `@anthropic-ai/claude-agent-sdk@0.2.89` + `@anthropic-ai/claude-code@2.1.89`

**风险等级**: 低（已在 halo-org v2.1.10 验证）

**预计工时**: 2-4 小时

---

## 步骤清单

### Step 1: 更新 package.json

**改动**:
```diff
- "@anthropic-ai/claude-agent-sdk": "0.1.76",
- "@anthropic-ai/claude-code": "latest",
+ "@anthropic-ai/claude-agent-sdk": "0.2.89",
+ "@anthropic-ai/claude-code": "2.1.89",
```

**验证**: `npm install` 后检查 `node_modules/@anthropic-ai/claude-agent-sdk/package.json` 中 `version` 字段

---

### Step 2: 新建 resolved-sdk.ts

**文件路径**: `src/server/services/agent/resolved-sdk.ts`

**实现要点**:
- 定义 `SdkModule` 接口（仅包含 CC SDK 需要的 4 个函数签名）
- 模块级变量 `_sdk: SdkModule | null`、`_initPromise: Promise<void> | null`
- `initSdk()`: 幂等初始化，调用一次后返回缓存的 promise
- `loadCcSdk()`: 使用 `import(/* @vite-ignore */ '@anthropic-ai/claude-agent-sdk')` 运行时加载
- `createSession()`: 调用 `sdk.unstable_v2_createSession()`（规范化命名）
- `ensureInitialized()`: 调用前守卫

**参考**: halo-org `src/main/services/agent/resolved-sdk.ts`（简化版）

---

### Step 3: 修改 session-manager.ts

**改动位置**:
1. 第 11 行: 替换 import 语句
2. 第 269 行: 替换函数调用

```diff
- import { unstable_v2_createSession } from '@anthropic-ai/claude-agent-sdk'
+ import { createSession } from './resolved-sdk'

  // ...
- const session = await unstable_v2_createSession(sdkOptions)
+ const session = await createSession(sdkOptions)
```

---

### Step 4: 修改 mcp-manager.ts

**改动位置**:
1. 第 9 行: 替换 import 语句

```diff
- import { query as claudeQuery } from '@anthropic-ai/claude-agent-sdk'
+ import { query } from './resolved-sdk'
```

内部使用时保持 `claudeQuery` 别名或直接用 `query`，确保迭代器使用方式不变。

---

### Step 5: 更新测试 mock

**文件**: `tests/unit/apps/runtime/runtime.test.ts`

当前 mock 了三样东西: `unstable_v2_createSession`、`tool`、`createSdkMcpServer`。
需要改为 mock `resolved-sdk`，并补充 `createSession` 和 `query` 的 mock。

```diff
- vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
-   unstable_v2_createSession: vi.fn(),
-   tool: vi.fn(() => ({ _isTool: true })),
-   createSdkMcpServer: vi.fn(() => ({})),
- }))
+ vi.mock('../../../src/server/services/agent/resolved-sdk', () => ({
+   createSession: vi.fn(),
+   query: vi.fn(),
+   tool: vi.fn(() => ({ _isTool: true })),
+   createSdkMcpServer: vi.fn(() => ({})),
+ }))
```

> 注意: 相对路径需要根据 `runtime.test.ts` 的实际位置调整。
> 如果 mock 路径解析失败，可以在 test setup 中全局 mock。

---

### Step 6: Bootstrap 集成

在 server 启动入口调用 `initSdk()`，位置在 `send-message.ts` 或 bootstrap 流程中
首次使用 createSession 之前即可。最简单的做法是在 `send-message.ts` 中
`sendMessage` 函数开头添加惰性初始化。

---

### Step 7: 安装依赖

```bash
npm install @anthropic-ai/claude-agent-sdk@0.2.89 @anthropic-ai/claude-code@2.1.89
```

完成后检查:
- `node_modules/@anthropic-ai/claude-agent-sdk/package.json` → version 为 `0.2.89`
- `node_modules/@anthropic-ai/claude-code/package.json` → version 为 `2.1.89`
- `npm ls @anthropic-ai/claude-agent-sdk` 无错误

---

### Step 8: 验证

```bash
npm run build          # 确保编译通过
npm run test:unit      # 确保单元测试通过
```

重点验证:
- MCP 连接测试功能
- 会话创建和消息发送
- SSE 流式响应
- 会话复用（process reuse）

---

## 检查清单

| # | 项目 | 完成 |
|---|---|---|
| 1 | `package.json` 版本号已更新 | ☐ |
| 2 | `resolved-sdk.ts` 已创建并导出 4 个函数 | ☐ |
| 3 | `session-manager.ts` import 和调用已修改 | ☐ |
| 4 | `mcp-manager.ts` import 已修改 | ☐ |
| 5 | `runtime.test.ts` mock 已更新 | ☐ |
| 6 | Bootstrap `initSdk()` 已集成 | ☐ |
| 7 | `npm install` 成功 | ☐ |
| 8 | `npm run build` 通过 | ☐ |
| 9 | `npm run test:unit` 通过 | ☐ |
| 10 | MCP 连接测试正常 | ☐ |
| 11 | 会话创建/消息收发正常 | ☐ |
| 12 | 文件已提交 | ☐ |

## 回滚方案

如果升级后出现问题：
1. `git checkout -- package.json package-lock.json` 恢复依赖配置
2. `npm install` 重新安装原版本
3. `git checkout -- src/server/services/agent/resolved-sdk.ts` 删除新文件
4. `git checkout -- src/server/services/agent/session-manager.ts src/server/services/agent/mcp-manager.ts` 恢复原文件
5. `git checkout -- tests/unit/apps/runtime/runtime.test.ts` 恢复测试文件
