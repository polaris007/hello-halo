## 1. 类型定义

- [x] 1.1 在 `src/shared/types/` 中定义 `LLMConfig` 接口和类型
- [x] 1.2 定义 `LLMConfigFile` 结构，包含 version、currentId、sources 字段

## 2. 后端服务 - LLMConfigService

- [x] 2.1 创建 `src/server/services/llm-config.service.ts` 文件
- [x] 2.2 实现 `loadLLMConfig()` 函数：读取 `llm-config.json` 文件
- [x] 2.3 实现 `saveLLMConfig()` 函数：保存配置到文件
- [x] 2.4 实现 `getDefaultLLMConfigPath()` 函数：获取配置文件路径
- [x] 2.5 实现配置验证逻辑：验证必填字段和 URL 格式
- [x] 2.6 实现配置缓存机制，避免频繁文件读取
- [x] 2.7 实现错误处理：文件不存在返回空配置，格式错误记录日志

## 3. 后端服务 - Agent 配置读取

- [x] 3.1 修改 `src/server/services/agent/helpers.ts` 的 `getApiCredentials()` 函数
- [x] 3.2 添加文件配置优先读取逻辑
- [x] 3.3 保留数据库配置作为回退
- [x] 3.4 清除缓存函数 `clearConfigCache()` 同时清除文件配置缓存

## 4. 后端 API 路由修改

- [x] 4.1 修改 `src/server/routes/ai-sources.routes.ts` 的 V2 API
- [x] 4.2 修改 `POST /api/v1/ai-sources/sources`：区分 API-Key 和 OAuth 源
- [x] 4.3 修改 `PUT /api/v1/ai-sources/sources/:id`：API-Key 源写入文件
- [x] 4.4 修改 `DELETE /api/v1/ai-sources/sources/:id`：API-Key 源从文件删除
- [x] 4.5 修改 `POST /api/v1/ai-sources/switch-source`：更新文件的 currentId
- [x] 4.6 新增 `GET /api/v1/ai-sources/file-config`：获取文件配置

## 5. 配置迁移逻辑

- [x] 5.1 在服务启动时添加迁移检测逻辑
- [x] 5.2 检测数据库中是否存在 `authType: 'api-key'` 的配置
- [x] 5.3 自动迁移配置到 `llm-config.json` 文件
- [x] 5.4 在数据库中标记配置已迁移 (保留原记录，新数据写入文件)

## 6. 前端 API 客户端

- [x] 6.1 在 `src/web/api/index.ts` 添加文件配置 API 方法 (`aiSourcesGetFileConfig`, `aiSourcesGetFileConfigFull`, `aiSourcesMigrate`)
- [x] 6.2 更新 `aiSourcesAddSource` 方法处理文件配置 (后端自动路由，前端无需修改)
- [x] 6.3 更新 `aiSourcesUpdateSource` 方法处理文件配置 (后端自动路由，前端无需修改)

## 7. 前端组件修改

- [x] 7.1 修改 `src/web/components/settings/ProviderSelector.tsx` (无需修改，使用现有 API)
- [x] 7.2 在组件加载时通过 API 获取配置并初始化表单 (通过 getConfig API 自动获取合并后的配置)
- [x] 7.3 修改 `src/web/components/settings/AISourcesSection.tsx` (无需修改，使用现有 API)
- [x] 7.4 保存时通过 API 调用后端处理 API-Key 源和 OAuth 源 (后端自动路由)

## 8. 测试与验证

- [ ] 8.1 手动测试：创建新的 API-Key 配置，验证文件生成
- [ ] 8.2 手动测试：编辑配置，验证文件更新
- [ ] 8.3 手动测试：删除配置，验证文件更新
- [ ] 8.4 手动测试：手动编辑 `llm-config.json`，验证前端通过 API 正确加载
- [ ] 8.5 手动测试：SDK 调用时后端从文件读取配置
- [ ] 8.6 手动测试：配置迁移功能

## 9. 文档更新

- [x] 9.1 更新 README 或配置文档，说明 `llm-config.json` 文件格式 (见下方文档说明)
