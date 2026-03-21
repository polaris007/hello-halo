## Context

当前架构中，`maxTurns` 配置存在以下问题：
- 前端 `SystemSection.tsx` 有配置 UI，但仅在桌面模式（`!isRemoteMode`）下显示
- 后端 `send-message.ts` 两处硬编码 `maxTurns: 50`，未读取用户配置
- 配置保存/读取 API 已存在（`api.setConfig({ agent: { maxTurns } })`）

```
┌─────────────────────────────────────────────────────────────────┐
│                        Current State                            │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Web)     │  Frontend (Desktop)  │  Backend           │
│  ─────────────      │  ─────────────────   │  ──────            │
│  SystemSection      │  SystemSection       │  send-message.ts   │
│  (hidden)           │  (visible)           │                    │
│                     │                      │  maxTurns: 50      │
│  ❌ No UI           │  ✅ Has UI           │  ❌ Hardcoded      │
│                     │  ❌ Not used         │                    │
└─────────────────────────────────────────────────────────────────┘
```

## Goals / Non-Goals

**Goals:**
- 在 Web 模式下显示"每条消息最大轮次"配置项
- 后端从配置中读取 `maxTurns` 值替代硬编码
- 配置变更后新消息立即生效（无需重启服务）

**Non-Goals:**
- 不改变配置存储机制（复用现有 `agent.maxTurns` 字段）
- 不添加会话级别的 maxTurns 控制
- 不修改 SDK 的 maxTurns 行为

## Decisions

### D1: 前端配置项显示位置

**Decision**: 在 Web 模式下也显示 SystemSection 组件中的 maxTurns 配置

**Rationale**:
- 配置项已存在于 `SystemSection.tsx`，只需移除 `!isRemoteMode` 条件限制
- 与桌面端保持一致的 UI 体验
- 配置项属于 AI 行为设置，与系统诊断等功能分离

**Alternatives Considered**:
- 在 AI Model 区域添加：不符合现有 UI 分组逻辑
- 新建独立配置区块：增加复杂度，无必要

### D2: 后端配置读取方式

**Decision**: 在 `send-message.ts` 的 `buildBaseSdkOptions` 调用处读取配置

**Rationale**:
- 配置读取应在消息发送时进行，确保使用最新配置值
- `buildBaseSdkOptions` 参数已支持 `maxTurns` 字段
- 最小改动范围，仅修改两处调用点

**Implementation**:
```typescript
// Before
maxTurns: 50,

// After
maxTurns: config?.agent?.maxTurns ?? 50,
```

**Alternatives Considered**:
- 在 `buildBaseSdkOptions` 内部读取配置：需传入 config 参数，增加耦合
- 在 session 创建时设置：SDK 不支持动态修改 maxTurns

### D3: 配置值验证

**Decision**: 保持前端验证逻辑，后端不额外验证

**Rationale**:
- 前端已有 `Math.max(10, Math.min(9999, value))` 验证
- 后端使用 `?? 50` 默认值兜底
- 配置 API 无需修改

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| 用户设置过大的 maxTurns 导致长时间执行 | 默认值 50 合理；用户需主动修改；有日志记录 |
| 配置读取失败 | 使用 `?? 50` 默认值兜底 |
| 旧配置文件无 agent.maxTurns 字段 | 默认值 50 生效 |

## Migration Plan

无需迁移，配置为可选字段，默认值 50。
