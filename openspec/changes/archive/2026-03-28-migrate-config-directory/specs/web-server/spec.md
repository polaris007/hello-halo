# Web Server (Delta)

## ADDED Requirements

### Requirement: 启动时配置目录初始化

系统 SHALL 在服务启动时初始化配置目录并输出相关日志。

#### Scenario: 配置目录初始化日志
- **WHEN** 服务启动
- **THEN** 系统解析配置目录路径
- **AND** 日志输出 `[Config] Config directory: <path> (from <source>)`

#### Scenario: 检测旧配置位置
- **WHEN** 服务启动
- **AND** 项目根目录存在 `server.json` 或 `llm-config.json`
- **AND** 配置目录不存在对应文件
- **THEN** 系统输出迁移提示日志
- **AND** 继续从旧位置加载配置

### Requirement: Docker 配置目录支持

系统 SHALL 在 Docker 部署场景下正确处理配置目录。

#### Scenario: Docker 默认配置目录
- **WHEN** 应用在 Docker 容器中启动
- **AND** 工作目录为 `/app`
- **THEN** 配置目录默认为 `/app/config`

#### Scenario: Docker 挂载配置目录
- **WHEN** Docker 启动时挂载配置目录 `-v /host/config:/app/config`
- **THEN** 系统从挂载的配置目录读取配置文件
