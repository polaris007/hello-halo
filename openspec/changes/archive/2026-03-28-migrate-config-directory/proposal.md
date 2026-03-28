## Why

当前项目的配置文件（`server.json`、`llm-config.json`）分散在项目根目录下，Docker 容器部署时需要分别挂载每个配置文件，管理不便。将所有配置文件统一迁移到一个 `config/` 目录下，可以实现：

1. **简化 Docker 部署**：只需挂载一个目录即可传入所有自定义配置
2. **配置集中管理**：所有配置文件在一个位置，便于备份和版本控制
3. **符合常规实践**：大多数应用将配置放在独立的 `config/` 目录

## What Changes

- 将 `server.json` 从项目根目录迁移到 `config/server.json`
- 将 `llm-config.json` 从项目根目录迁移到 `config/llm-config.json`
- 修改配置文件读取逻辑，优先从 `config/` 目录读取
- 支持环境变量 `HALO_CONFIG_DIR` 指定配置目录位置
- 更新 Dockerfile 和 docker-compose.yml 配置挂载路径
- 添加配置迁移脚本，自动迁移旧位置的配置文件
- **BREAKING**: 旧位置的配置文件将不再被读取（但有迁移兼容提示）

## Capabilities

### New Capabilities

- `config-directory`: 配置目录管理能力，统一管理所有配置文件的位置、读取优先级和环境变量配置

### Modified Capabilities

- `data-storage-config`: 配置文件搜索路径将优先查找 `config/` 目录
- `llm-config-file`: LLM 配置文件位置从项目根目录改为 `config/` 目录
- `web-server`: 服务器启动时的配置加载逻辑需要适配新目录

## Impact

- **代码修改**:
  - `src/server/services/config.service.ts` - 配置文件路径解析逻辑
  - `src/server/services/llm-config.service.ts` - LLM 配置文件路径
  - `src/server/index.ts` - 启动时配置目录初始化

- **Docker 相关**:
  - `Dockerfile` - 创建 config 目录，调整环境变量
  - `docker-compose.yml` - 更新挂载配置示例

- **文档更新**:
  - `docs/docker-deployment.md` - 更新部署说明

- **迁移脚本**:
  - 新增 `scripts/migrate-config-dir.js` - 自动迁移旧配置文件

- **向后兼容**:
  - 启动时检测旧位置配置文件，输出迁移提示
  - 可通过环境变量禁用自动迁移
