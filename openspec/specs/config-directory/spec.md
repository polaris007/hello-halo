# Config Directory

## Purpose

统一管理应用配置文件的目录位置，支持通过环境变量自定义配置目录，简化 Docker 部署时的配置挂载。

## Requirements

### Requirement: 配置目录默认位置

系统 SHALL 使用应用启动目录下的 `config/` 子目录作为默认配置目录。

#### Scenario: 开发环境默认路径
- **WHEN** 应用从 `/home/user/halo` 目录启动
- **AND** 未指定任何配置目录配置
- **THEN** 系统使用 `/home/user/halo/config` 作为配置目录

#### Scenario: Docker 环境默认路径
- **WHEN** 应用在 Docker 容器中启动，工作目录为 `/app`
- **AND** 未指定任何配置目录配置
- **THEN** 系统使用 `/app/config` 作为配置目录

### Requirement: 环境变量配置

系统 SHALL 支持 `HALO_CONFIG_DIR` 环境变量指定配置目录。

#### Scenario: 通过环境变量指定配置目录
- **WHEN** 设置环境变量 `HALO_CONFIG_DIR=/etc/halo/config`
- **THEN** 系统使用 `/etc/halo/config` 作为配置目录

#### Scenario: 环境变量优先级高于默认值
- **WHEN** 设置环境变量 `HALO_CONFIG_DIR=/custom/config`
- **THEN** 系统忽略默认路径，使用 `/custom/config`

### Requirement: 配置目录路径日志

系统 SHALL 在启动时输出解析后的配置目录绝对路径。

#### Scenario: 启动日志输出配置目录
- **WHEN** 应用启动完成
- **THEN** 日志中包含 `[Config] Config directory: <absolute-path>` 消息

#### Scenario: 显示配置来源
- **WHEN** 配置目录通过环境变量指定
- **THEN** 日志中说明 `Config directory from HALO_CONFIG_DIR environment variable`

### Requirement: 配置目录不存在时处理

系统 SHALL 在配置目录不存在时继续启动，不自动创建目录。

#### Scenario: 配置目录不存在
- **WHEN** 配置目录 `/app/config` 不存在
- **THEN** 系统输出日志 `[Config] Config directory not found: /app/config`
- **AND** 系统继续使用默认配置

#### Scenario: 使用旧位置配置文件
- **WHEN** 配置目录不存在
- **AND** 项目根目录存在 `server.json`
- **THEN** 系统从项目根目录读取配置
- **AND** 输出迁移提示日志

### Requirement: 相对路径解析

系统 SHALL 支持相对路径，并相对于当前工作目录解析。

#### Scenario: 相对路径解析
- **WHEN** 指定配置目录为 `./config`
- **AND** 当前工作目录为 `/home/user/halo`
- **THEN** 系统使用 `/home/user/halo/config` 作为配置目录

### Requirement: 跨平台路径兼容

系统 SHALL 使用 Node.js `path` 模块处理路径，确保跨平台兼容。

#### Scenario: Windows 路径处理
- **WHEN** 在 Windows 系统上运行
- **THEN** 系统使用正确的路径分隔符生成路径

#### Scenario: Linux 路径处理
- **WHEN** 在 Linux 系统上运行
- **THEN** 系统使用正确的路径分隔符生成路径
