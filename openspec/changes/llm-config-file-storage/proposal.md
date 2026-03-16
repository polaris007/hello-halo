## Why

当前自定义 API 的大模型配置存储在 SQLite 数据库中，存在以下问题：
1. 配置与数据库耦合，难以手动编辑和版本管理
2. Claude Agent SDK 调用时需要从数据库读取配置，增加了复杂度
3. 配置文件无法方便地进行备份、迁移或手动修改

将大模型配置改为文件存储可以解决这些问题，支持手动编辑、易于备份迁移，并简化 SDK 调用时的配置读取。

## What Changes

- 新增 `llm-config.json` 文件存储自定义 API 大模型配置
- 后端服务负责配置文件的读写，前端通过 API 与后端交互
- 自定义 API 配置从 SQLite 数据库迁移到 JSON 文件
- 后端 API 在响应前端请求时从文件读取配置并返回
- Claude Agent SDK 调用时后端从文件读取大模型配置
- **BREAKING** `aiSources` 配置项中 `authType: 'api-key'` 的源将从数据库迁移到文件存储

## Capabilities

### New Capabilities

- `llm-config-file`: 自定义 API 大模型配置文件存储能力，包括配置文件的读写、格式定义和 SDK 集成

### Modified Capabilities

- `ai-provider-config`: 修改自定义 API 配置的存储方式，从数据库改为文件存储，保留 OAuth 配置在数据库中

## Impact

### 受影响的代码

- `src/server/services/config.service.ts` - 新增 LLM 配置文件读写服务
- `src/server/services/agent/helpers.ts` - `getApiCredentials()` 函数改为从文件读取
- `src/server/routes/ai-sources.routes.ts` - V2 API 需要区分数据库操作和文件操作
- `src/web/components/settings/ProviderSelector.tsx` - 加载时通过 API 获取配置并填充表单
- `src/web/components/settings/AISourcesSection.tsx` - 保存时通过 API 写入文件

### API 变更

- `GET /api/v1/ai-sources/sources` - 对于 `authType: 'api-key'` 的源，从文件读取
- `POST /api/v1/ai-sources/sources` - 对于 `authType: 'api-key'` 的源，写入文件
- `PUT /api/v1/ai-sources/sources/:id` - 对于 `authType: 'api-key'` 的源，更新文件

### 配置文件格式

文件位置：`<项目启动目录>/llm-config.json`

```json
{
  "version": 1,
  "currentId": "source-uuid",
  "sources": [
    {
      "id": "source-uuid",
      "name": "My Custom API",
      "provider": "openai",
      "apiUrl": "https://api.example.com/v1",
      "apiKey": "sk-xxx",
      "model": "gpt-4o",
      "availableModels": [
        { "id": "gpt-4o", "name": "GPT-4o" }
      ],
      "createdAt": "2025-01-01T00:00:00.000Z",
      "updatedAt": "2025-01-01T00:00:00.000Z"
    }
  ]
}
```
