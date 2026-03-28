# Data Storage Config (Delta)

## MODIFIED Requirements

### Requirement: 配置文件位置与数据目录关联

系统 SHALL 优先从配置目录查找配置文件，然后检查项目根目录。

#### Scenario: 配置文件在配置目录内
- **WHEN** 配置目录为 `/app/config`
- **AND** `/app/config/server.json` 存在
- **THEN** 系统从 `/app/config/server.json` 加载配置

#### Scenario: 配置文件搜索顺序
- **WHEN** 查找配置文件 `server.json`
- **THEN** 系统按以下顺序搜索：
  1. `HALO_CONFIG_PATH` 环境变量指定的路径
  2. `{config-dir}/server.json`（新位置）
  3. `{cwd}/server.json`（旧位置，向后兼容）

#### Scenario: 配置文件不存在使用默认值
- **WHEN** 所有配置文件搜索路径都不存在配置文件
- **THEN** 系统使用默认配置
- **AND** 日志输出 `[Config] No config file found, using defaults`

#### Scenario: 检测到旧位置配置文件
- **WHEN** 配置目录中不存在 `server.json`
- **AND** 项目根目录存在 `server.json`
- **THEN** 系统从项目根目录加载配置
- **AND** 日志输出迁移提示 `[Config] Found server.json in legacy location, consider moving to config/ directory`
