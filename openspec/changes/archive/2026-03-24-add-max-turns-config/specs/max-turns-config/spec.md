# Max Turns Config

## Purpose

提供用户可配置的 AI Agent 每条消息最大工具调用轮次设置，控制任务执行深度。

## ADDED Requirements

### Requirement: 每条消息最大轮次配置
系统 SHALL 允许用户配置 AI Agent 每条消息的最大工具调用轮次。

#### Scenario: 配置范围
- **WHEN** 用户配置最大轮次
- **THEN** 系统接受 10-9999 范围内的整数值
- **AND** 默认值为 50

#### Scenario: Web 模式下显示配置项
- **WHEN** 用户在 Web 模式下访问设置页面
- **THEN** 系统显示"每条消息最大轮次"配置项
- **AND** 配置项位于 System Section 区域

#### Scenario: 配置持久化
- **WHEN** 用户修改最大轮次配置
- **THEN** 系统保存配置到 `agent.maxTurns` 字段
- **AND** 配置立即生效，新消息使用新配置值

#### Scenario: 后端读取配置
- **WHEN** 后端处理消息发送请求
- **THEN** 系统从配置中读取 `agent.maxTurns` 值
- **AND** 若配置未设置，使用默认值 50
- **AND** 将值传递给 Claude Agent SDK 的 `maxTurns` 参数
