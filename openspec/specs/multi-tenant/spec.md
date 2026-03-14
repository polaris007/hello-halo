# Multi-Tenant

## Purpose

TBD - 多租户数据隔离能力，确保不同用户的数据相互隔离。

## Requirements

### Requirement: 用户数据隔离

系统 SHALL 确保用户只能访问属于他们的数据。

#### Scenario: 空间访问隔离
- **WHEN** 用户 A 尝试访问属于用户 B 的空间
- **THEN** 系统返回 403 Forbidden 错误
- **AND** 记录访问尝试

#### Scenario: 对话访问隔离
- **WHEN** 用户 A 尝试读取用户 B 空间中的对话
- **THEN** 系统返回 403 Forbidden 错误

#### Scenario: 配置访问隔离
- **WHEN** 用户 A 尝试读取或修改用户 B 的 AI 提供商配置
- **THEN** 系统返回 403 Forbidden 错误

### Requirement: 管理员用户访问

系统 SHALL 允许管理员用户访问所有用户的数据。

#### Scenario: 管理员访问用户空间
- **WHEN** 管理员用户尝试访问任何用户的空间
- **THEN** 系统允许访问
- **AND** 记录管理员访问用于审计

#### Scenario: 管理员列出所有用户
- **WHEN** 管理员用户请求用户列表
- **THEN** 系统返回系统中的所有用户

### Requirement: 创建时数据归属

系统 SHALL 在创建资源时自动将所有权分配给已认证用户。

#### Scenario: 创建带所有权的空间
- **WHEN** 已认证用户创建新空间
- **THEN** 系统将空间的 user_id 设置为当前用户的 id
- **AND** 该空间只能由所有者（或管理员）访问

#### Scenario: 创建带所有权的对话
- **WHEN** 已认证用户创建对话
- **THEN** 系统将对话的 user_id 设置为当前用户的 id

#### Scenario: 保存带所有权的配置
- **WHEN** 已认证用户保存 AI 提供商配置
- **THEN** 系统将配置与用户的 id 一起存储
- **AND** 覆盖该用户的任何现有配置

### Requirement: 文件系统隔离

系统 SHALL 为每个用户创建独立的文件存储空间。

#### Scenario: 用户空间目录
- **WHEN** 用户创建空间
- **THEN** 系统在用户专属目录下创建空间文件夹

#### Scenario: 文件访问控制
- **WHEN** 用户访问文件
- **THEN** 系统验证文件属于当前用户的某个空间

#### Scenario: 用户目录结构
- **WHEN** 系统初始化用户
- **THEN** 系统创建目录结构 `~/.halo/users/{user_id}/spaces/`

### Requirement: 数据库查询过滤

系统 SHALL 自动按 user_id 过滤数据库查询。

#### Scenario: 按用户列出空间
- **WHEN** 用户请求他们的空间列表
- **THEN** 系统执行带有 `WHERE user_id = ?` 子句的查询
- **AND** 只返回属于该用户的空间

#### Scenario: 按用户获取对话
- **WHEN** 用户请求特定对话
- **THEN** 系统使用 `WHERE id = ? AND user_id = ?` 查询
- **AND** 如果对话属于其他用户则返回 404

### Requirement: 现有数据迁移

系统 SHALL 在首次启动时将现有数据迁移到多租户模型。

#### Scenario: 首次启动迁移
- **WHEN** 系统升级后首次启动
- **AND** 检测到没有 user_id 的现有数据
- **THEN** 系统创建默认管理员用户
- **AND** 将所有现有数据分配给管理员用户
- **AND** 记录迁移完成

#### Scenario: 全新安装
- **WHEN** 系统在全新安装上启动
- **THEN** 系统创建带有 user_id 列的数据库模式
- **AND** 不需要迁移
