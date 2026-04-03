# Data Storage Config

## Purpose

数据存储路径配置能力，支持多种方式指定数据目录位置，以适应不同部署场景（开发、生产、Docker）。

## Requirements

### Requirement: 默认数据目录

系统 SHALL 使用应用启动目录下的 `data/` 子目录作为默认数据存储位置。

#### Scenario: 开发环境默认路径
- **WHEN** 应用从 `/home/user/hello` 目录启动
- **AND** 未指定任何数据目录配置
- **THEN** 系统使用 `/home/user/hello/data` 作为数据目录

#### Scenario: Docker 环境默认路径
- **WHEN** 应用在 Docker 容器中启动，工作目录为 `/app`
- **AND** 未指定任何数据目录配置
- **THEN** 系统使用 `/app/data` 作为数据目录

### Requirement: 环境变量配置

系统 SHALL 支持 `HELLO_DATA_DIR` 环境变量指定数据目录。

#### Scenario: 通过环境变量指定数据目录
- **WHEN** 设置环境变量 `HELLO_DATA_DIR=/var/lib/hello`
- **THEN** 系统使用 `/var/lib/hello` 作为数据目录

#### Scenario: 环境变量优先级高于默认值
- **WHEN** 设置环境变量 `HELLO_DATA_DIR=/custom/data`
- **THEN** 系统忽略默认路径，使用 `/custom/data`

### Requirement: 启动参数配置

系统 SHALL 支持 `--data-dir` 启动参数指定数据目录。

#### Scenario: 通过启动参数指定数据目录
- **WHEN** 使用命令 `node server.js --data-dir /opt/hello/data` 启动
- **THEN** 系统使用 `/opt/hello/data` 作为数据目录

#### Scenario: 启动参数优先级最高
- **WHEN** 同时设置 `HELLO_DATA_DIR=/env/data` 环境变量
- **AND** 使用 `--data-dir /arg/data` 启动参数
- **THEN** 系统使用 `/arg/data`（启动参数优先）

#### Scenario: 支持短参数形式
- **WHEN** 使用命令 `node server.js -d /opt/hello/data` 启动
- **THEN** 系统使用 `/opt/hello/data` 作为数据目录

### Requirement: 配置文件数据路径

系统 SHALL 支持在配置文件中通过 `data.basePath` 指定数据目录。

#### Scenario: 从配置文件读取数据目录
- **WHEN** 配置文件 `server.json` 包含 `{"data": {"basePath": "/config/hello"}}`
- **AND** 未设置环境变量和启动参数
- **THEN** 系统使用 `/config/hello` 作为数据目录

#### Scenario: 环境变量覆盖配置文件
- **WHEN** 配置文件指定 `data.basePath` 为 `/config/hello`
- **AND** 设置环境变量 `HELLO_DATA_DIR=/env/data`
- **THEN** 系统使用 `/env/data`（环境变量优先）

### Requirement: 数据目录自动创建

系统 SHALL 在数据目录不存在时自动创建完整目录结构。

#### Scenario: 首次启动创建目录
- **WHEN** 数据目录 `/app/data` 不存在
- **THEN** 系统创建 `/app/data` 目录
- **AND** 创建必要的子目录结构

#### Scenario: 创建嵌套目录
- **WHEN** 指定数据目录为 `/opt/hello/production/data`
- **AND** `/opt/hello` 目录不存在
- **THEN** 系统创建完整路径 `/opt/hello/production/data`

#### Scenario: 权限不足时报错
- **WHEN** 数据目录路径指向无写入权限的位置
- **THEN** 系统启动失败并输出明确的错误信息
- **AND** 错误信息包含目标路径和权限要求

### Requirement: 数据目录路径日志

系统 SHALL 在启动时输出解析后的数据目录绝对路径。

#### Scenario: 启动日志输出数据目录
- **WHEN** 应用启动完成
- **THEN** 日志中包含 `[Config] Data directory: <absolute-path>` 消息

#### Scenario: 显示配置来源
- **WHEN** 数据目录通过环境变量指定
- **THEN** 日志中说明 `Data directory from HALO_DATA_DIR environment variable`

### Requirement: 相对路径解析

系统 SHALL 支持相对路径，并相对于当前工作目录解析。

#### Scenario: 相对路径解析
- **WHEN** 指定数据目录为 `./halo-data`
- **AND** 当前工作目录为 `/home/user/halo`
- **THEN** 系统使用 `/home/user/halo/halo-data` 作为数据目录

#### Scenario: 相对路径转换为绝对路径
- **WHEN** 使用相对路径指定数据目录
- **THEN** 系统在内部转换为绝对路径存储和使用
- **AND** 日志输出绝对路径

### Requirement: 跨平台路径兼容

系统 SHALL 使用 Node.js `path` 模块处理路径，确保跨平台兼容。

#### Scenario: Windows 路径处理
- **WHEN** 在 Windows 系统上运行
- **AND** 指定数据目录为 `data`
- **THEN** 系统使用正确的路径分隔符生成路径

#### Scenario: Linux 路径处理
- **WHEN** 在 Linux 系统上运行
- **AND** 指定数据目录为 `data`
- **THEN** 系统使用正确的路径分隔符生成路径

### Requirement: 配置文件位置与数据目录关联

系统 SHALL 优先从配置目录查找配置文件，然后检查项目根目录。

#### Scenario: 配置文件在配置目录内
- **WHEN** 配置目录为 `/app/config`
- **AND** `/app/config/server.json` 存在
- **THEN** 系统从 `/app/config/server.json` 加载配置

#### Scenario: 配置文件搜索顺序
- **WHEN** 查找配置文件 `server.json`
- **THEN** 系统按以下顺序搜索：
  1. `HELLO_CONFIG_PATH` 环境变量指定的路径
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

### Requirement: 数据目录结构

系统 SHALL 在数据目录下维护标准的子目录结构。

#### Scenario: 完整目录结构
- **WHEN** 数据目录初始化完成
- **THEN** 存在以下结构：
  - `{data-dir}/hello.db` - 数据库文件
  - `{data-dir}/logs/` - 日志目录
  - `{data-dir}/users/` - 用户数据目录
