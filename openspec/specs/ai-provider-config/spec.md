# AI Provider Config

## Purpose

TBD - AI 提供商配置管理，支持每个用户独立配置和系统默认值。

## Requirements

### Requirement: 存储 AI 提供商配置

系统 SHALL 为每个用户存储 AI 提供商配置。

#### Scenario: 保存 Anthropic 配置
- **WHEN** 用户保存 Anthropic 提供商配置（包含 apiKey 和 model）
- **THEN** 系统将配置存储到数据库
- **AND** 将其与用户的 id 关联

#### Scenario: 保存 OpenAI 配置
- **WHEN** 用户保存 OpenAI 提供商配置（包含 apiKey 和 model）
- **THEN** 系统验证 apiKey 格式
- **AND** 存储配置

#### Scenario: 保存自定义 API 配置
- **WHEN** 用户保存自定义提供商配置（包含 apiUrl、apiKey 和 model）
- **THEN** 系统验证 apiUrl 格式
- **AND** 存储配置

#### Scenario: 获取 AI 配置
- **WHEN** 用户请求其 AI 提供商配置
- **THEN** 系统返回配置
- **AND** 包含完整的 apiKey（内部部署场景）

### Requirement: 配置验证

系统 SHALL 在保存前验证 AI 提供商配置。

#### Scenario: 验证 API Key 格式
- **WHEN** 用户保存 Anthropic API key
- **THEN** 系统验证它以 "sk-" 开头
- **AND** 具有有效长度

#### Scenario: 测试 API 连接
- **WHEN** 用户使用 "test_connection" 标志保存配置
- **THEN** 系统尝试测试 API 调用
- **AND** 返回成功或错误消息

### Requirement: 回退到系统默认

系统 SHALL 在用户没有配置时使用系统默认配置。

#### Scenario: 使用系统默认
- **WHEN** 没有个人配置的用户发起 AI 对话
- **AND** 系统默认已配置
- **THEN** 系统使用系统默认 AI 提供商

#### Scenario: 没有可用配置时出错
- **WHEN** 没有个人配置的用户发起 AI 对话
- **AND** 没有配置系统默认
- **THEN** 系统返回错误 "AI provider not configured"

### Requirement: 管理员覆盖

系统 SHALL 允许管理员覆盖用户的 AI 配置。

#### Scenario: 管理员设置用户提供商
- **WHEN** 管理员更新用户的 AI 提供商配置
- **THEN** 系统更新用户的配置
- **AND** 通知用户更改

#### Scenario: 锁定用户配置
- **WHEN** 管理员为用户启用配置锁定
- **THEN** 用户无法修改其 AI 提供商设置
- **AND** 系统在修改尝试时返回 403
