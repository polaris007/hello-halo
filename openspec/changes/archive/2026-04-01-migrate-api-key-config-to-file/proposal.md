## Why

当前系统采用混合存储策略，API-Key 配置同时保存在文件和数据库中，导致代码复杂度增加和潜在的数据一致性问题。为简化架构、减少冗余存储并提高配置管理的清晰度，需要将 API-Key 配置完全迁移到文件存储。

## What Changes

- **完全迁移 API-Key 配置**：将所有 API-Key 类型的 AI 源配置迁移到 `llm-config.json` 文件中
- **移除数据库同步逻辑**：数据库不再存储 API-Key 配置的任何信息
- **修改读取逻辑**：系统直接从文件读取 API-Key 配置，不再需要合并文件和数据库配置
- **保持 OAuth 配置**：OAuth 类型的配置继续存储在数据库中
- **简化 API 端点**：修改相关 API 端点，移除对 API-Key 配置的数据库操作

## Capabilities

### New Capabilities
- `api-key-config-file-only`: 仅通过文件存储和管理 API-Key 配置的能力

### Modified Capabilities
- `llm-config-file`: 修改配置存储策略，移除数据库同步逻辑
- `ai-provider-config`: 修改 API 端点实现，不再操作数据库中的 API-Key 配置

## Impact

- **代码修改**:
  - `src/server/routes/ai-sources.routes.ts` - 移除 API-Key 配置的数据库操作
  - `src/server/routes/configs.routes.ts` - 简化配置读取逻辑
  - `src/server/services/llm-config.service.ts` - 可能需要调整配置管理逻辑

- **API 影响**:
  - `POST /api/v1/ai-sources/sources` - 不再保存 API-Key 源到数据库
  - `PUT /api/v1/ai-sources/sources/:id` - 不再更新数据库中的 API-Key 元数据
  - `DELETE /api/v1/ai-sources/sources/:id` - 不再从数据库删除 API-Key 元数据
  - `GET /api/v1/configs` - 简化配置读取逻辑，直接从文件获取 API-Key 配置

- **兼容性**:
  - 由于应用尚未上线，不需要考虑数据迁移问题
  - 保持 OAuth 配置的存储方式不变，确保系统稳定性
  - API 响应格式保持一致，确保前端兼容性
