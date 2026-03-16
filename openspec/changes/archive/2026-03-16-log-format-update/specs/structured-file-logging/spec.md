## MODIFIED Requirements

### Requirement: 结构化文件日志记录
系统 SHALL 提供结构化文件日志记录能力，支持server和client分别记录到不同的日志文件，并按日期轮转。所有日志时间戳 SHALL 使用本地系统时间。

#### Scenario: Server日志文件位置
- **WHEN** server启动时
- **THEN** 系统创建日志目录`<应用启动目录>/logs/`（如果不存在）
- **AND** server日志默认写入`<应用启动目录>/logs/server-YYYY-MM-DD.log`文件

#### Scenario: 环境变量覆盖日志目录
- **WHEN** 设置了环境变量`HALO_LOG_DIR=/custom/log/path`
- **THEN** server日志写入`/custom/log/path/server-YYYY-MM-DD.log`文件

#### Scenario: Server日志级别控制
- **WHEN** 设置了环境变量`HALO_LOG_LEVEL=DEBUG`
- **THEN** server记录所有级别的日志（DEBUG、INFO、WARN、ERROR）
- **WHEN** 设置了环境变量`HALO_LOG_LEVEL=ERROR`
- **THEN** server仅记录ERROR级别的日志

#### Scenario: Client日志持久化
- **WHEN** client在浏览器环境中运行时
- **THEN** client日志存储在浏览器的`localStorage`或`IndexedDB`中
- **AND** client定期（每10秒）通过API将日志发送到server

#### Scenario: Client日志发送到Server
- **WHEN** client积累超过100条日志或经过10秒
- **THEN** client通过POST `/api/v1/logs/client`发送日志到server
- **AND** server将接收到的client日志写入`<日志目录>/client-YYYY-MM-DD.log`文件

#### Scenario: 日志按天轮转
- **WHEN** 新的一天开始（00:00 本地时间）
- **THEN** 系统创建新的日志文件，文件名包含新的日期
- **AND** 继续向新文件写入日志

#### Scenario: 日志文件保留策略
- **WHEN** 日志文件超过7天
- **THEN** 系统自动删除旧的日志文件
- **WHEN** 设置了环境变量`HALO_LOG_RETENTION_DAYS=30`
- **THEN** 系统保留最近30天的日志文件

#### Scenario: 日志文件大小监控
- **WHEN** 单个日志文件大小超过100MB
- **THEN** 系统自动创建新的日志文件并继续写入
- **AND** 旧文件保留在磁盘上

#### Scenario: 日志时间戳格式
- **WHEN** 系统记录日志
- **THEN** 时间戳格式为 `[YYYY-MM-DDTHH:mm:ss.SSS]`
- **AND** 时间戳使用本地系统时间，而非UTC时间
- **AND** 完整日志格式为 `[YYYY-MM-DDTHH:mm:ss.SSS] [LEVEL] message`
