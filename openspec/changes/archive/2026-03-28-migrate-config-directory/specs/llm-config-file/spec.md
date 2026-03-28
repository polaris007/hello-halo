# LLM Config File (Delta)

## MODIFIED Requirements

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
