## ADDED Requirements

### Requirement: 服务器日志配置
系统 SHALL 提供灵活的服务器日志配置选项。

#### Scenario: 日志目录配置
- **WHEN** server启动时
- **THEN** 系统使用环境变量`HALO_LOG_DIR`的值作为日志目录（如果设置）
- **WHEN** 环境变量`HALO_LOG_DIR`未设置
- **THEN** 系统使用`<应用启动目录>/logs/`作为默认日志目录

#### Scenario: 日志级别配置
- **WHEN** 设置了环境变量`HALO_LOG_LEVEL=DEBUG`
- **THEN** server记录所有级别的日志（DEBUG、INFO、WARN、ERROR）
- **WHEN** 设置了环境变量`HALO_LOG_LEVEL=INFO`
- **THEN** server记录INFO、WARN、ERROR级别的日志
- **WHEN** 设置了环境变量`HALO_LOG_LEVEL=WARN`
- **THEN** server记录WARN、ERROR级别的日志
- **WHEN** 设置了环境变量`HALO_LOG_LEVEL=ERROR`
- **THEN** server仅记录ERROR级别的日志

#### Scenario: 控制台输出配置
- **WHEN** 设置了环境变量`HALO_LOG_CONSOLE=false`
- **THEN** server不输出日志到控制台
- **AND** 日志仅写入文件
- **WHEN** 设置了环境变量`HALO_LOG_CONSOLE=true`
- **THEN** server同时输出日志到控制台和文件

#### Scenario: 客户端日志接收端点
- **WHEN** client发送日志到server
- **THEN** 系统提供POST `/api/v1/logs/client`端点接收客户端日志
- **AND** server将接收到的客户端日志写入`<日志目录>/client-YYYY-MM-DD.log`文件

#### Scenario: 日志轮转配置
- **WHEN** 设置了环境变量`HALO_LOG_ROTATION_DAYS=30`
- **THEN** 系统保留最近30天的日志文件
- **WHEN** 环境变量`HALO_LOG_ROTATION_DAYS`未设置
- **THEN** 系统默认保留最近7天的日志文件

#### Scenario: 日志文件大小配置
- **WHEN** 设置了环境变量`HALO_LOG_MAX_SIZE_MB=500`
- **THEN** 当单个日志文件大小超过500MB时自动轮转
- **WHEN** 环境变量`HALO_LOG_MAX_SIZE_MB`未设置
- **THEN** 当单个日志文件大小超过100MB时自动轮转

## MODIFIED Requirements

### Requirement: 服务启动配置
系统 SHALL 支持灵活的启动配置，包括日志相关配置。

#### Scenario: 端口配置
- **WHEN** 用户指定端口号
- **THEN** 服务监听指定端口（默认 3000）

#### Scenario: 绑定地址配置
- **WHEN** 用户指定绑定地址
- **THEN** 服务绑定指定地址（默认 127.0.0.1）

#### Scenario: 配置文件
- **WHEN** 存在配置文件 ~/.halo/server.json
- **THEN** 系统从配置文件读取配置，包括日志配置

#### Scenario: 环境变量
- **WHEN** 设置环境变量 HALO_PORT
- **THEN** 系统使用环境变量覆盖配置
- **WHEN** 设置环境变量 HALO_LOG_DIR
- **THEN** 系统使用环境变量指定的目录作为日志目录
- **WHEN** 设置环境变量 HALO_LOG_LEVEL
- **THEN** 系统使用环境变量指定的级别作为日志级别