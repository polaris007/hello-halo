## Why

当前项目后端硬编码 `maxTurns: 50`，前端虽然有配置项但仅限桌面模式显示，且配置值未被后端实际使用。用户无法自定义 AI Agent 每条消息的最大工具调用轮次，限制了复杂任务的执行深度控制。

## What Changes

- 在 Web 模式下新增"每条消息最大轮次"配置项（与桌面端一致）
- 后端从**全局系统配置**中读取 `maxTurns` 值，替代硬编码的 50
- 配置范围：10-9999，默认值 50
- 配置为系统级，所有用户共享同一个设置

## Capabilities

### New Capabilities

- `max-turns-config`: 用户可配置 AI Agent 每条消息的最大工具调用轮次，控制任务执行深度

### Modified Capabilities

- `streaming-agent-response`: 修改消息发送逻辑，从配置中读取 maxTurns 而非硬编码

## Impact

- **前端**: `SystemSection.tsx` - 在 Web 模式下也显示配置项
- **后端**: `send-message.ts` - 从配置中读取 maxTurns 值
- **API**: 配置保存/读取接口已有，无需新增
- **类型**: `AgentConfig` 接口已定义 `maxTurns` 字段
