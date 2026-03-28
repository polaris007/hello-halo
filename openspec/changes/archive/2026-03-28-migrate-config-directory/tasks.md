# Tasks: 配置目录迁移

## 1. 配置目录基础设施

- [x] 1.1 创建 `src/server/services/config-dir.service.ts`，实现配置目录路径解析逻辑
- [x] 1.2 支持 `HALO_CONFIG_DIR` 环境变量和 `--config-dir` 启动参数
- [x] 1.3 实现配置目录优先级：环境变量 > 启动参数 > 默认 `./config`
- [x] 1.4 添加配置目录自动创建和日志输出

## 2. 配置文件路径迁移

- [x] 2.1 修改 `src/server/services/llm-config.service.ts`，使用配置目录路径
- [x] 2.4 更新 LLM 配置文件路径为 `{config-dir}/llm-config.json`
- [x] 2.2 修改 `src/server/services/config.service.ts`，使用配置目录路径
- [x] 2.3 更新配置文件搜索顺序：`{config-dir}/server.json` > `{data-dir}/server.json` > `{cwd}/server.json`

## 3. 向后兼容与迁移

- [x] 3.1 实现旧配置位置检测逻辑（检测根目录的 server.json 和 llm-config.json）
- [x] 3.2 添加迁移提示日志，引导用户迁移配置
- [x] 3.3 支持从旧位置读取配置（兼容模式）

## 4. Docker 配置更新

- [x] 4.1 更新 `Dockerfile`，创建 `/app/config` 目录
- [x] 4.2 更新 `docker-compose.yml`，添加配置目录挂载示例
- [x] 4.3 添加示例配置文件 `config/server.example.json` 和 `config/llm-config.example.json`
- [x] 4.4 更新 `.dockerignore`，排除根目录旧配置文件

## 5. 启动入口更新

- [x] 5.1 修改 `src/server/index.ts`，在启动时初始化配置目录
- [x] 5.2 添加配置目录初始化日志输出
- [x] 5.3 输出配置文件加载来源信息

## 6. 测试与验证

- [x] 6.1 单元测试：配置目录路径解析测试
- [x] 6.2 单元测试：配置文件加载优先级测试
- [x] 6.3 集成测试：Docker 构建验证
- [x] 6.4 手动验证：迁移兼容性测试

## 7. 文档更新

- [x] 7.1 更新 Docker 部署文档，说明配置目录挂载方式
- [x] 7.2 更新 README.md，添加配置目录说明
- [x] 7.3 创建迁移指南文档
