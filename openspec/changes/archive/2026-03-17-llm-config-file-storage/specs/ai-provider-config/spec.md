## MODIFIED Requirements

### Requirement: 存储 AI 提供商配置

系统 SHALL 为每个用户存储 AI 提供商配置，其中 `authType: 'api-key'` 的配置存储在文件中，OAuth 配置存储在数据库中。

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

## ADDED Requirements

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
