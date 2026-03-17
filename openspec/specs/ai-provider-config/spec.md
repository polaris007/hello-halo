# AI Provider Config

## Purpose

TBD - AI 提供商配置管理，支持每个用户独立配置和系统默认值。

## Requirements

### Requirement: 存储 AI 提供商配置

系统 SHALL 为每个用户存储 AI 提供商配置，其中 `authType: 'api-key'` 的配置存储在文件中，OAuth 配置存储在数据库中。

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

#### Scenario: 保存 API Key 类型配置
- **WHEN** 用户保存 `authType: 'api-key'` 的提供商配置
- **THEN** 系统将配置存储到 `llm-config.json` 文件
- **AND** 不存储到数据库

#### Scenario: 保存 OAuth 类型配置
- **WHEN** 用户保存 `authType: 'oauth'` 的提供商配置
- **THEN** 系统将配置存储到数据库
- **AND** 不修改 `llm-config.json` 文件

#### Scenario: 获取 AI 配置
- **WHEN** 用户请求其 AI 提供商配置
- **THEN** 系统合并文件配置和数据库配置
- **AND** 返回完整的配置列表
- **AND** 对于 `authType: 'api-key'` 的配置返回完整的 apiKey

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

### Requirement: 前端配置表单初始化

系统 SHALL 在打开自定义 API 配置页面时，通过 API 从后端获取配置内容并初始化表单。

#### Scenario: 加载现有配置到表单
- **WHEN** 用户打开自定义 API 配置页面
- **AND** 后端 `llm-config.json` 文件中存在配置
- **THEN** 前端通过 API 获取配置
- **AND** 将 `provider` 字段设置为下拉框选中值
- **AND** 将 `apiUrl` 字段填充到 URL 输入框
- **AND** 将 `apiKey` 字段填充到 API Key 输入框
- **AND** 将 `model` 字段设置为模型选择器的选中值
- **AND** 如有 `apiType` 字段，保留该值

#### Scenario: 配置为空时显示默认值
- **WHEN** 用户打开自定义 API 配置页面
- **AND** 后端 `llm-config.json` 文件不存在或为空
- **THEN** 前端显示默认配置表单
- **AND** 提供商默认选择第一个选项
- **AND** API URL 显示该提供商的默认 URL

### Requirement: API 源配置删除

系统 SHALL 支持通过 API 删除 API-Key 类型的 AI 源配置。

#### Scenario: 删除 API-Key 源
- **WHEN** 用户删除 `authType: 'api-key'` 的 AI 源
- **THEN** 系统从 `llm-config.json` 文件中移除该源
- **AND** 同时从数据库元数据中移除该源
- **AND** 如果删除的是当前使用的源，自动切换到其他可用源

#### Scenario: 删除 OAuth 源
- **WHEN** 用户删除 `authType: 'oauth'` 的 AI 源
- **THEN** 系统仅从数据库中移除该源
- **AND** 不影响 `llm-config.json` 文件
