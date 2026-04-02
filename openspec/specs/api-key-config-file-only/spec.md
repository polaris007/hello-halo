# API Key Config File Only

## Purpose

仅通过文件存储和管理 API-Key 配置的能力，简化配置管理架构，减少数据一致性问题。

## Requirements

### Requirement: API-Key 配置仅存储在文件中

系统 SHALL 将 `authType: 'api-key'` 的 AI 源配置仅存储在 `llm-config.json` 文件中，不再存储到数据库。

#### Scenario: 添加 API-Key 源
- **WHEN** 用户添加 `authType: 'api-key'` 的 AI 源
- **THEN** 系统将配置存储到 `llm-config.json` 文件
- **AND** 系统不再将配置存储到数据库

#### Scenario: 更新 API-Key 源
- **WHEN** 用户更新 `authType: 'api-key'` 的 AI 源
- **THEN** 系统更新 `llm-config.json` 文件中的配置
- **AND** 系统不再更新数据库中的配置

#### Scenario: 删除 API-Key 源
- **WHEN** 用户删除 `authType: 'api-key'` 的 AI 源
- **THEN** 系统从 `llm-config.json` 文件中移除配置
- **AND** 系统不再从数据库中移除配置

### Requirement: 配置读取逻辑优化

系统 SHALL 直接从 `llm-config.json` 文件读取 API-Key 配置，与数据库中的 OAuth 配置合并后返回。

#### Scenario: 读取所有 AI 源配置
- **WHEN** 系统需要读取所有 AI 源配置
- **THEN** 系统从 `llm-config.json` 文件读取 API-Key 配置
- **AND** 系统从数据库读取 OAuth 配置
- **AND** 系统合并两种配置并返回

#### Scenario: API-Key 配置不存在
- **WHEN** `llm-config.json` 文件不存在或为空
- **THEN** 系统返回空的 API-Key 配置列表
- **AND** 系统仍然返回数据库中的 OAuth 配置

### Requirement: 启动逻辑调整

系统 SHALL 移除启动时的数据库到文件的迁移逻辑。

#### Scenario: 系统启动
- **WHEN** 系统启动
- **THEN** 系统不再执行数据库到文件的配置迁移
- **AND** 系统直接从 `llm-config.json` 文件读取 API-Key 配置