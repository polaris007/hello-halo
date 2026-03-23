# Halo 数字人内存处理机制参考

## 1. 内存处理机制概述

Halo 为数字人（Automation Apps）提供了完善的内存处理机制，用于在不同运行之间持久化状态和历史记录。

### 核心功能
- **内存快照**：构建并注入内存上下文，无需工具调用即可立即获取
- **内存压缩**：自动压缩过大的内存文件
- **会话摘要**：保存每次运行的详细摘要
- **结构化存储**：使用 `# now` / `# History` 双结构

## 2. 内存快照 (Memory Snapshot)

### 快照内容
内存快照包含以下信息：

| 字段 | 说明 |
|------|------|
| `exists` | memory.md 是否存在 |
| `totalLines` | memory.md 总行数 |
| `sizeBytes` | 文件大小（字节） |
| `firstSection` | 第一个顶级部分的完整内容（通常是 `# now`） |
| `headers` | 所有标题的结构化信息 |
| `fullContent` | 小文件（≤30行）的完整内容，否则为 null |
| `archiveFiles` | 最近 5 个运行归档文件名 |
| `archiveTotalCount` | 归档文件总数 |
| `memoryFilePath` | memory.md 的绝对路径 |
| `rawContent` | 原始文件内容（内部使用） |

### 快照使用方式

#### 场景 1：触发时注入
```typescript
// 构建内存快照
const memorySnapshot = await buildMemorySnapshot(memoryScope)

// 构建初始消息并注入快照
const initialMessage = buildInitialMessage({
  triggerContext: trigger.description,
  userConfig: app.userConfig,
  appName: app.spec.name,
  memorySnapshot,  // 传入快照
})

// 发送给 AI
await processStream(session, initialMessage, ...)
```

#### 场景 2：运行时 `memory_status` 工具
AI 可以在运行中通过 `memory_status` 工具查询内存结构。

### 发送给 AI 的内容格式

**小文件（≤30行）**：完整内容
```markdown
## Memory
**File**: /path/to/memory.md
**Size**: 25 lines, 1.2KB

### Content (full):
# now
## State
...完整内容...
```

**大文件（>30行）**：第一部分 + 结构大纲
```markdown
## Memory
**File**: /path/to/memory.md
**Size**: 150 lines, 8.5KB

### Working Memory (# now, auto-loaded):
# now
## State
...（# now 部分的完整内容）...

### Structure:
  L1: # now (80 lines) ← loaded above
  L81: # History (70 lines)

Use Read("/path/to/memory.md") to see full content...
```

## 3. 内存文件结构

### memory.md 结构
```markdown
# now

## State | brief one-line summary of current state
- runs_completed: 84
- alerts_sent: 5
- last_result: AirPods ¥1199, no change

## AirPods Pro (JD.com)
- current_price: ¥1199
- lowest_seen: ¥1099 (2026-01-08)

## Patterns
- prices are lowest on weekday mornings

## Errors
- JD anti-bot: switch to mobile User-Agent

# History

## 2026-01-15-1430 | routine check, no change

## 2026-01-15-1400 | MacBook ¥7999↑, alerted user
### Details
- MacBook Air: ¥7499→¥7999
```

### 磁盘文件结构
```
{spacePath}/.halo/apps/{appId}/
  memory.md              -- 活动内存 (# now + # History)
  memory/
    run/                 -- 每次运行的会话摘要
      2026-01-15-1430-run.md
    2026-01-10-0000.md   -- 压缩归档（旧 memory.md 备份）
```

## 4. 内存压缩机制

### 压缩流程
1. **检查阈值**：当 memory.md 超过 100KB 时触发压缩
2. **读取内容**：读取当前 memory.md 内容
3. **归档旧文件**：将旧文件归档到 `memory/` 目录
4. **生成摘要**：通过 LLM 生成简洁摘要
5. **写入新文件**：将摘要写为新的 memory.md

### 压缩策略
- 保留 `# now` 结构和关键状态
- 只保留最近 ~10 个 `# History` 条目
- 丢弃旧的历史条目（它们已存在于 `memory/run/` 中）

## 5. 会话摘要保存

每次运行后，系统会自动保存会话摘要到 `memory/run/{timestamp}-run.md`，包含：
- App 名称
- 触发类型
- 运行结果
- 持续时间
- 令牌使用量
- AI 输出摘要

## 6. 使用场景

内存处理机制**仅用于数字人（Automation Apps）**，包括：

| 模式 | 说明 |
|------|------|
| **自动化运行** | 定时/事件触发的后台运行 |
| **应用聊天** | 用户与数字人的交互式对话 |

**普通对话（用户 ↔ Halo）不使用此内存机制**。

## 7. 数字人与 Automation Apps 的关系

**Digital Human（数字人）** 是 Halo 中对 **Automation Apps（自动化应用）** 的用户友好称呼：

- **技术术语**：代码中使用 `automation` 或 `Automation Apps`
- **用户术语**：UI 中显示为 `Digital Human` 或 `数字人`
- **本质**：同一个概念，都是指可以按计划或响应事件运行的自动化 AI 智能体

## 8. 代码位置

| 文件 | 说明 |
|------|------|
| `src/main/apps/runtime/execute.ts` | 数字人运行时核心逻辑 |
| `src/main/platform/memory/snapshot.ts` | 内存快照构建 |
| `src/main/apps/runtime/prompt.ts` | 初始消息构建（包含内存注入） |
| `src/main/platform/memory/DESIGN.md` | 内存模块设计文档 |
| `src/main/apps/runtime/app-chat.ts` | 数字人交互式聊天 |

## 9. 设计优势

1. **零延迟访问**：内存上下文通过初始消息预注入，无需工具调用
2. **节省令牌**：大文件只发送关键部分
3. **自动管理**：系统自动处理压缩和归档
4. **结构化存储**：清晰的 `# now` / `# History` 结构
5. **容错机制**：LLM 不可用时的后备压缩方案

## 10. AI 操作模式

AI 使用原生 Claude Code 工具操作内存：
- **Read**：读取 memory.md 或归档文件
- **Edit**：更新 `# now` 字段，在 `# History` 中添加摘要
- **Write**：首次创建或完全重构内存文件
- **memory_status**：查询内存结构元数据（MCP 工具）