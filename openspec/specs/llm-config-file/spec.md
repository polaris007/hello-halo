# LLM Config File

## Purpose

自定义 API 大模型配置文件存储，将 `authType: 'api-key'` 的 AI 源配置存储在独立的 JSON 文件中，支持手动编辑、备份迁移和 SDK 直接读取。

## Requirements

### Requirement: LLM 配置文件存储

系统 SHALL 将 `authType: 'api-key'` 的 AI 源配置存储在配置目录下的 `llm-config.json` 文件中。

#### Scenario: 创建新配置文件
- **WHEN** 用户首次配置自定义 API 大模型
- **AND** 配置目录下的 `llm-config.json` 文件不存在
- **THEN** 系统在配置目录创建 `llm-config.json` 文件
- **AND** 文件包含版本号和初始配置结构

#### Scenario: 更新配置文件
- **WHEN** 用户修改自定义 API 大模型配置
- **THEN** 系统更新配置目录下的 `llm-config.json` 文件
- **AND** 更新 `updatedAt` 时间戳

#### Scenario: 配置文件格式
- **WHEN** 系统写入 `llm-config.json` 文件
- **THEN** 文件使用 UTF-8 编码
- **AND** JSON 格式化缩进为 2 空格
- **AND** 包含 `version`、`currentId`、`sources` 字段
- **AND** 每个 source 可包含可选的 `apiType` 字段

### Requirement: 配置文件读取

系统 SHALL 优先从配置目录读取 LLM 配置文件。

#### Scenario: 从配置目录加载配置文件
- **WHEN** 系统需要读取大模型配置
- **AND** 配置目录下存在 `llm-config.json` 文件
- **THEN** 系统解析配置目录下的 JSON 内容
- **AND** 返回配置对象

#### Scenario: 配置文件不存在于配置目录
- **WHEN** 系统需要读取大模型配置
- **AND** 配置目录下不存在 `llm-config.json` 文件
- **AND** 项目根目录存在 `llm-config.json` 文件
- **THEN** 系统从项目根目录读取配置
- **AND** 日志输出迁移提示

#### Scenario: 所有位置都不存在配置文件
- **WHEN** 系统需要读取大模型配置
- **AND** 配置目录和项目根目录都不存在 `llm-config.json` 文件
- **THEN** 系统返回空配置结构
- **AND** 不抛出错误

#### Scenario: 配置文件格式错误
- **WHEN** 系统解析 `llm-config.json` 文件
- **AND** 文件内容不是有效 JSON
- **THEN** 系统记录错误日志
- **AND** 返回空配置结构
- **AND** 前端显示配置文件格式错误提示

### Requirement: SDK 配置读取

系统 SHALL 在调用 Claude Agent SDK 时从 `llm-config.json` 文件读取大模型配置。

#### Scenario: SDK 使用文件配置
- **WHEN** Claude Agent SDK 需要获取 API 凭证
- **AND** `llm-config.json` 文件存在且有效
- **THEN** 系统从文件读取当前配置的大模型
- **AND** 使用文件中的 `apiUrl`、`apiKey`、`model` 配置

#### Scenario: SDK 配置回退
- **WHEN** Claude Agent SDK 需要获取 API 凭证
- **AND** `llm-config.json` 文件不存在或无效
- **THEN** 系统回退到数据库配置
- **AND** 继续正常工作

### Requirement: 配置文件验证

系统 SHALL 验证配置文件内容的合法性。

#### Scenario: 验证必填字段
- **WHEN** 系统保存配置到文件
- **THEN** 验证每个源包含 `id`、`name`、`provider`、`apiUrl`、`model` 字段
- **AND** 如果验证失败返回错误信息

#### Scenario: 验证 URL 格式
- **WHEN** 系统保存配置到文件
- **AND** 配置包含 `apiUrl`
- **THEN** 验证 URL 以 `http://` 或 `https://` 开头

### Requirement: 配置迁移

系统 SHALL 支持从数据库迁移现有配置到文件。

#### Scenario: 自动迁移
- **WHEN** 系统启动
- **AND** 数据库中存在 `authType: 'api-key'` 的 AI 源配置
- **AND** `llm-config.json` 文件不存在
- **THEN** 系统自动将数据库配置迁移到文件
- **AND** 在数据库中标记配置已迁移

#### Scenario: 迁移后清理
- **WHEN** 配置迁移成功
- **THEN** 数据库中保留配置记录但不作为主要数据源
- **AND** 后续操作使用文件配置
