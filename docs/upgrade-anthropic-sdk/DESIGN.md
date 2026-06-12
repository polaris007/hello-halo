# Anthropic SDK 升级 - 设计文档

## 背景

当前项目使用 `@anthropic-ai/claude-agent-sdk` v0.1.76，需要升级到 v0.2.89
以获取新功能、性能改进和 bug 修复。该版本已在 halo-org v2.1.10 中验证。

## 架构变更：引入 resolved-sdk 抽象层

### 现状问题

当前代码直接从 `@anthropic-ai/claude-agent-sdk` 导入，分布在 2 个源文件和 1 个测试文件中：

```
session-manager.ts  ──import──>  @anthropic-ai/claude-agent-sdk (unstable_v2_createSession)
mcp-manager.ts      ──import──>  @anthropic-ai/claude-agent-sdk (query)
runtime.test.ts     ──mock────>  @anthropic-ai/claude-agent-sdk
```

每次 SDK 升级都需要修改所有消费点，且无法支持未来可能的多引擎切换。

### 目标架构

引入 `resolved-sdk.ts` 作为 SDK 唯一入口，遵循**零静态导入**原则：

```
session-manager.ts  ──import──>  resolved-sdk.ts  ──runtime dynamic import──>  @anthropic-ai/claude-agent-sdk
mcp-manager.ts      ──import──>  resolved-sdk.ts  ──runtime dynamic import──>  @anthropic-ai/claude-agent-sdk
runtime.test.ts     ──mock────>  resolved-sdk.ts
```

### resolved-sdk.ts 职责

1. **统一入口**: 所有 SDK 访问必须通过此文件，禁止其他文件直接 import SDK 包
2. **运行时动态加载**: 使用 `import(/* @vite-ignore */ ...)` 在运行时加载 SDK，而非编译时绑定
3. **API 规范化**: 抹平 SDK 版本间函数命名差异（如 `unstable_v2_createSession` → `createSession`）
4. **初始化守卫**: `initSdk()` 必须在 bootstrap 阶段调用，使用前检查初始化状态
5. **未来扩展预留**: 架构上预留多引擎切换能力（但不实现 Halo/Codex 引擎）

### 导出的公共 API

| 函数 | 对应 SDK 函数 | 用途 |
|---|---|---|
| `tool(...args)` | `tool` | 定义带 schema 验证的 MCP 工具 |
| `createSdkMcpServer(options)` | `createSdkMcpServer` | 从工具定义创建进程内 MCP 服务器 |
| `createSession(options)` | `unstable_v2_createSession` (规范化) | 创建持久的代理会话 |
| `query(params)` | `query` | 运行一次性查询（返回 AsyncIterable） |

### 核心类型

```typescript
interface SdkModule {
  tool: (...args: any[]) => any
  createSdkMcpServer: (options: any) => any
  unstable_v2_createSession?: (options: any) => Promise<any>
  query: (params: any) => AsyncIterable<any>
}
```

### 生命周期

```
app bootstrap
  └─> initSdk() ──> import('@anthropic-ai/claude-agent-sdk')
       └─> 缓存 SdkModule 模块引用（进程级单例）
       └─> 引擎切换需要进程重启

conversation start
  └─> createSession(options) ──> sdk.unstable_v2_createSession(options)
       └─> 返回 V2SDKSession（send/stream/close）

MCP connection test
  └─> query(params) ──> sdk.query(params)
       └─> 返回 AsyncIterable
```

## 与 halo-org 方案的差异

hello-halo 的 `resolved-sdk.ts` 是 halo-org 的简化版本，主要差异：

| 方面 | halo-org | hello-halo |
|---|---|---|
| 支持的引擎 | anthropic / halo / codex | **仅 anthropic** |
| initSdk 调用位置 | Electron app.whenReady | Server bootstrap |
| executable | Electron headless | Node.js (nodePath) |
| 额外功能 | 引擎能力诊断、SDK logger | 无（保持精简） |

## 升级影响范围

### 直接改动文件（5 个）

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `package.json` | 修改 | 更新版本号 |
| `resolved-sdk.ts` | 新建 | SDK 统一入口 |
| `session-manager.ts` | 修改 | 导入路径 + 函数名 |
| `mcp-manager.ts` | 修改 | 导入路径 |
| `runtime.test.ts` | 修改 | Mock 路径 |

### 无需改动的文件

| 文件 | 原因 |
|---|---|
| `sdk-config.ts` | `buildSdkEnv()` 已经显式构建完整 env，兼容 0.2.x 的 env 替换模式 |
| `send-message.ts` | 通过 session-manager 间接使用 SDK，不直接导入 |
| `stream-processor.ts` | 处理的是 session 返回的流，不直接导入 SDK |
| `types.ts` | `McpServerStatusInfo` 类型已在 0.2.89 前兼容 |
| `permission-handler.ts` | 不直接导入 SDK |
| `system-prompt.ts` | 纯字符串，不依赖 SDK |
