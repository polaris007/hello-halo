## 1. 前端配置项显示

- [x] 1.1 修改 `src/web/pages/SettingsPage.tsx`，移除 SystemSection 的 `!isRemoteMode` 条件限制，使 Web 模式下也显示配置项

## 2. 后端配置读取

- [ ] 2.1 修改 `src/server/services/agent/send-message.ts` 的 `sendMessage` 函数，从**全局系统配置**中读取 maxTurns 值替代硬编码的 50
- [ ] 2.2 修改 `src/server/services/agent/send-message.ts` 的 `sendMessageWithSSE` 函数，从**全局系统配置**中读取 maxTurns 值替代硬编码的 50

## 3. 验证

- [ ] 3.1 验证 Web 模式下设置页面显示 maxTurns 配置项
- [ ] 3.2 验证配置保存后新消息使用正确的 maxTurns 值
