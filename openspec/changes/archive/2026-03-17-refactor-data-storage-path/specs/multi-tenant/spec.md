# Multi-Tenant (Delta)

## MODIFIED Requirements

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
- **THEN** 系统创建目录结构 `{data-dir}/users/{user_id}/spaces/`
- **AND** `{data-dir}` 为配置的数据目录（默认为 `{cwd}/data`）

## ADDED Requirements

### Requirement: 数据目录感知

系统 SHALL 使用配置的数据目录作为用户空间的基础路径。

#### Scenario: 空间路径基于数据目录
- **WHEN** 用户创建空间，空间 ID 为 `space-123`
- **AND** 用户 ID 为 `user-456`
- **AND** 数据目录为 `/app/data`
- **THEN** 系统创建空间目录 `/app/data/users/user-456/space-123`

#### Scenario: 数据目录变更后路径更新
- **WHEN** 系统数据目录从 `~/.halo` 变更为 `/app/data`
- **THEN** 新创建的空间使用新路径结构
- **AND** 现有空间路径在数据库迁移时更新
