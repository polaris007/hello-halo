# AI Provider Config (Delta)

## MODIFIED Requirements

### Requirement: API 源配置添加

系统 SHALL 支持通过 API 添加 AI 源配置，对于 API-Key 源仅存储在文件中。

#### Scenario: 添加 API-Key 源
- **WHEN** 用户通过 API 添加 `authType: 'api-key'` 的 AI 源
- **THEN** 系统将配置存储到 `llm-config.json` 文件
- **AND** 系统不再将配置存储到数据库
- **AND** 系统返回成功响应

#### Scenario: 添加 OAuth 源
- **WHEN** 用户通过 API 添加 `authType: 'oauth'` 的 AI 源
- **THEN** 系统将配置存储到数据库
- **AND** 系统返回成功响应

### Requirement: API 源配置更新

系统 SHALL 支持通过 API 更新 AI 源配置，对于 API-Key 源仅更新文件中的配置。

#### Scenario: 更新 API-Key 源
- **WHEN** 用户通过 API 更新 `authType: 'api-key'` 的 AI 源
- **THEN** 系统更新 `llm-config.json` 文件中的配置
- **AND** 系统不再更新数据库中的配置
- **AND** 系统返回成功响应

#### Scenario: 更新 OAuth 源
- **WHEN** 用户通过 API 更新 `authType: 'oauth'` 的 AI 源
- **THEN** 系统更新数据库中的配置
- **AND** 系统返回成功响应

### Requirement: API 源配置删除

系统 SHALL 支持通过 API 删除 AI 源配置，对于 API-Key 源仅从文件中删除。

#### Scenario: 删除 API-Key 源
- **WHEN** 用户通过 API 删除 `authType: 'api-key'` 的 AI 源
- **THEN** 系统从 `llm-config.json` 文件中移除该源
- **AND** 系统不再从数据库中移除该源
- **AND** 如果删除的是当前使用的源，自动切换到其他可用源
- **AND** 系统返回成功响应

#### Scenario: 删除 OAuth 源
- **WHEN** 用户通过 API 删除 `authType: 'oauth'` 的 AI 源
- **THEN** 系统仅从数据库中移除该源
- **AND** 系统返回成功响应

### Requirement: 配置读取

系统 SHALL 支持通过 API 读取 AI 源配置，合并文件中的 API-Key 配置和数据库中的 OAuth 配置。

#### Scenario: 读取所有 AI 源配置
- **WHEN** 用户通过 API 读取所有 AI 源配置
- **THEN** 系统从 `llm-config.json` 文件读取 API-Key 配置
- **AND** 系统从数据库读取 OAuth 配置
- **AND** 系统合并两种配置并返回
- **AND** API 响应格式保持一致

#### Scenario: 配置为空时
- **WHEN** 用户通过 API 读取 AI 源配置
- **AND** `llm-config.json` 文件不存在或为空
- **AND** 数据库中也没有配置
- **THEN** 系统返回空配置结构
- **AND** 系统不抛出错误
