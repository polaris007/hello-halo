# Request Response Logging

## Purpose

记录所有HTTP API请求和响应的详细报文内容，用于调试和监控。

## Requirements

### Requirement: 报文内容日志记录
系统 SHALL 记录所有HTTP API请求和响应的详细报文内容，用于调试和监控。

#### Scenario: HTTP请求日志记录
- **WHEN** 客户端发送HTTP请求到server
- **THEN** 系统记录请求的以下信息：
  - 时间戳（ISO格式）
  - 请求方法（GET、POST等）
  - 请求URL
  - 请求头（敏感头字段如Authorization自动脱敏）
  - 请求体（如果有）
  - 客户端IP地址
- **AND** 日志写入`<日志目录>/api-YYYY-MM-DD.log`文件

#### Scenario: HTTP响应日志记录
- **WHEN** server返回HTTP响应给客户端
- **THEN** 系统记录响应的以下信息：
  - 时间戳（ISO格式）
  - 响应状态码
  - 响应头
  - 响应体（如果有）
  - 请求处理时长（毫秒）
- **AND** 日志写入`<日志目录>/api-YYYY-MM-DD.log`文件

#### Scenario: 敏感信息脱敏
- **WHEN** 记录HTTP请求头
- **THEN** 系统自动脱敏以下字段：
  - `Authorization`: 替换为`[REDACTED]`
  - `Cookie`: 替换为`[REDACTED]`
  - `X-API-Key`: 替换为`[REDACTED]`
- **AND** 其他包含`sensitive`、`secret`、`token`、`password`字段名的头也自动脱敏

#### Scenario: 请求体大小限制
- **WHEN** HTTP请求体超过1MB
- **THEN** 系统只记录前1024个字符并在日志中添加`[TRUNCATED]`标记
- **WHEN** HTTP响应体超过1MB
- **THEN** 系统只记录前1024个字符并在日志中添加`[TRUNCATED]`标记

#### Scenario: 日志格式
- **WHEN** 记录HTTP请求/响应
- **THEN** 系统使用结构化JSON格式记录，包含以下字段：
```json
{
  "type": "http_request" | "http_response",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "method": "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  "url": "/api/v1/endpoint",
  "headers": { "key": "value" },
  "body": { "data": "value" },
  "status": 200,
  "duration": 123,
  "client_ip": "127.0.0.1"
}
```

#### Scenario: 排除特定端点
- **WHEN** 请求URL匹配`/health`或`/ready`端点
- **THEN** 系统不记录该请求的详细报文内容
- **AND** 只记录基本信息（时间戳、方法、URL、状态码）

#### Scenario: 配置控制
- **WHEN** 设置了环境变量`HALO_LOG_API_DETAIL=false`
- **THEN** 系统不记录请求/响应的详细报文内容
- **AND** 只记录基本信息（时间戳、方法、URL、状态码、时长）