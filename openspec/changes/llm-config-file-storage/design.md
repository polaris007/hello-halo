## Context

当前 Halo 的自定义 API 大模型配置存储在 SQLite 数据库的 `configs` 表中，以 JSON 字符串形式存储在 `aiSources` 键下。这导致：

1. **配置难以手动修改**：用户无法直接编辑配置文件来调整大模型设置
2. **SDK 调用复杂**：`getApiCredentials()` 需要从数据库读取配置，增加了服务层耦合
3. **配置迁移困难**：数据库配置不易于备份和迁移

现有架构：
- `src/server/services/agent/helpers.ts` 的 `getApiCredentials()` 从数据库读取配置
- `src/server/routes/ai-sources.routes.ts` 的 V2 API 操作数据库中的 `aiSources` 配置
- 前端 `ProviderSelector.tsx` 组件通过 API 读写配置

## Goals / Non-Goals

**Goals:**
- 将 `authType: 'api-key'` 的 AI 源配置迁移到 JSON 文件存储
- 后端服务负责配置文件的读写，前端通过 API 与后端交互
- 支持用户手动编辑 `llm-config.json` 文件
- 后端从文件读取配置供 Claude Agent SDK 使用
- 前端设置页面通过 API 正确加载和保存配置
- 保持 OAuth 类型配置继续存储在数据库中

**Non-Goals:**
- 不修改 OAuth 认证流程的存储方式
- 不修改多租户数据隔离架构
- 不涉及其他配置项的存储方式变更

## Decisions

### Decision 1: 配置文件位置

**选择**: `<项目启动目录>/llm-config.json`

**理由**:
- 与现有的 `server.json` 配置文件位置一致
- 便于用户发现和手动编辑
- 不依赖 `~/.halo/` 目录，适合容器化部署

**替代方案**:
- `~/.halo/llm-config.json`: 与应用数据目录一致，但不便于项目级别管理
- `<项目目录>/.halo/llm-config.json`: 隐藏目录，不易发现

### Decision 2: 配置文件格式

**选择**: JSON 格式，包含版本号、当前源ID和源列表

```json
{
  "version": 1,
  "currentId": "source-uuid",
  "sources": [
    {
      "id": "uuid",
      "name": "Display Name",
      "provider": "openai|anthropic|...",
      "apiUrl": "https://api.example.com/v1",
      "apiKey": "sk-xxx",
      "model": "gpt-4o",
      "availableModels": [{ "id": "gpt-4o", "name": "GPT-4o" }],
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ]
}
```

**理由**:
- JSON 格式易于手动编辑和程序解析
- 版本号便于未来格式升级
- 结构与现有 `AISourcesConfig` 兼容，减少转换成本

**替代方案**:
- YAML 格式: 需要额外依赖，且 JSON 更通用
- TOML 格式: 同样需要额外依赖

### Decision 3: 配置服务架构

**选择**: 创建独立的 `LLMConfigService` 服务

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                                │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │ ProviderSelector│    │     AISourcesSection            │ │
│  └────────┬────────┘    └───────────────┬─────────────────┘ │
│           │                              │                   │
│           └──────────────┬───────────────┘                   │
│                          ▼                                   │
│                   API Client (api.ts)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  ai-sources.routes.ts                    ││
│  │  ┌─────────────────┐    ┌────────────────────────────┐  ││
│  │  │ OAuth Sources   │    │    API-Key Sources         │  ││
│  │  │ (Database)      │    │  (LLMConfigService)        │  ││
│  │  └────────┬────────┘    └────────────┬───────────────┘  ││
│  │           │                          │                   ││
│  │           ▼                          ▼                   ││
│  │  ┌─────────────────┐    ┌────────────────────────────┐  ││
│  │  │    SQLite       │    │    llm-config.json         │  ││
│  │  └─────────────────┘    └────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                  Agent Module                            ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │  getApiCredentials() ──▶ LLMConfigService.load()    │││
│  │  └─────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**理由**:
- 分离关注点，API-Key 配置与 OAuth 配置分别处理
- 服务可被 API 路由和 Agent 模块复用
- 缓存机制避免频繁文件读取

**替代方案**:
- 扩展现有 `config.service.ts`: 职责混乱，该服务负责 `server.json` 配置
- 直接在路由中处理: 代码重复，Agent 模块无法复用

### Decision 4: SDK 配置读取方式

**选择**: 修改 `getApiCredentials()` 优先从 `llm-config.json` 读取

```typescript
export async function getApiCredentials(config?: any): Promise<ApiCredentials> {
  // 1. 尝试从 llm-config.json 读取
  const llmConfig = LLMConfigService.load()
  if (llmConfig?.currentId) {
    const source = llmConfig.sources.find(s => s.id === llmConfig.currentId)
    if (source && source.authType === 'api-key') {
      return {
        baseUrl: source.apiUrl,
        apiKey: source.apiKey,
        model: source.model,
        // ...
      }
    }
  }

  // 2. 回退到数据库配置（兼容 OAuth 和旧配置）
  const cfg = config || await getConfig()
  // ... 现有逻辑
}
```

**理由**:
- 最小化改动，保持现有 API 兼容
- 文件配置优先级高于数据库，支持手动覆盖
- 回退机制保证向后兼容

## Risks / Trade-offs

### Risk 1: 文件权限问题
- **风险**: 用户可能没有文件写入权限
- **缓解**: 服务启动时检查文件权限，错误时返回友好提示

### Risk 2: 配置文件损坏
- **风险**: 用户手动编辑可能导致 JSON 格式错误
- **缓解**:
  - 加载时捕获 JSON 解析错误，返回空配置
  - 保存前创建备份文件 `.bak`
  - 前端展示解析错误提示

### Risk 3: 配置迁移
- **风险**: 现有数据库中的 API-Key 配置需要迁移
- **缓解**:
  - 首次加载时检测数据库配置，自动迁移到文件
  - 迁移后保留数据库记录但标记为已迁移

### Risk 4: 并发写入
- **风险**: 多进程/多线程同时写入配置文件
- **缓解**: 使用文件锁或写入队列（当前单进程场景风险较低）

## Migration Plan

### Phase 1: 新增服务
1. 创建 `LLMConfigService` 服务
2. 实现文件读写和缓存逻辑
3. 添加配置验证

### Phase 2: 修改 API 路由
1. 修改 `ai-sources.routes.ts` 的 V2 API
2. 区分 API-Key 源和 OAuth 源的存储位置
3. 更新前端 API 客户端

### Phase 3: 修改 Agent 配置读取
1. 修改 `getApiCredentials()` 函数
2. 添加文件配置优先级逻辑

### Phase 4: 数据迁移
1. 启动时检测数据库中的 API-Key 配置
2. 自动迁移到 `llm-config.json`
3. 保留数据库记录但标记为已迁移

### Rollback Strategy
- 删除 `llm-config.json` 文件
- 系统自动回退到数据库配置
- 无需代码回滚

## Open Questions

1. **是否需要支持环境变量覆盖文件配置？**
   - 建议：暂不支持，保持配置来源单一

2. **文件变更是否需要热重载？**
   - 建议：暂不支持，下次请求时自动读取最新配置

3. **是否需要配置加密？**
   - 建议：暂不加密，API Key 以明文存储，由用户自行保护文件权限
