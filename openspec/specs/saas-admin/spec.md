# SaaS Admin

## Purpose

TBD - SaaS 管理员功能，提供用户管理、系统配置和活动日志监控能力。

## Requirements

### Requirement: 用户管理

系统 SHALL 允许管理员管理用户。

#### Scenario: 列出所有用户
- **WHEN** 管理员发送 GET 请求到 /api/v1/admin/users
- **THEN** 系统返回分页的用户列表
- **AND** 包含用户 id、邮箱、姓名、角色、创建时间、最后登录时间

#### Scenario: 创建新用户
- **WHEN** 管理员发送 POST 请求到 /api/v1/admin/users 并携带用户详情
- **THEN** 系统创建新用户账户
- **AND** 返回创建的用户对象

#### Scenario: 更新用户
- **WHEN** 管理员发送 PUT 请求到 /api/v1/admin/users/:id
- **THEN** 系统更新用户信息
- **AND** 返回更新后的用户对象

#### Scenario: 删除用户
- **WHEN** 管理员发送 DELETE 请求到 /api/v1/admin/users/:id
- **THEN** 系统软删除用户（标记为 inactive）
- **AND** 保留所有用户数据用于审计

#### Scenario: 非管理员访问被拒绝
- **WHEN** 非管理员用户尝试访问 /api/v1/admin/* 端点
- **THEN** 系统返回 403 Forbidden 错误

### Requirement: 系统配置

系统 SHALL 允许管理员配置系统级设置。

#### Scenario: 获取系统配置
- **WHEN** 管理员请求 GET /api/v1/admin/config
- **THEN** 系统返回系统级配置
- **AND** 包含默认 AI 提供商、速率限制、功能开关

#### Scenario: 更新系统配置
- **WHEN** 管理员发送 PUT /api/v1/admin/config
- **THEN** 系统验证并更新配置
- **AND** 立即应用更改

### Requirement: 用户活动监控

系统 SHALL 为管理员提供活动日志。

#### Scenario: 查看活动日志
- **WHEN** 管理员请求 GET /api/v1/admin/activity
- **THEN** 系统返回最近的用户活动日志
- **AND** 包含操作类型、user_id、时间戳、详情

#### Scenario: 按用户筛选活动
- **WHEN** 管理员使用 user_id 筛选请求活动
- **THEN** 系统只返回指定用户的活动

#### Scenario: 按日期范围筛选活动
- **WHEN** 管理员使用 start_date 和 end_date 请求活动
- **THEN** 系统返回日期范围内的活动

### Requirement: 默认 AI 提供商配置

系统 SHALL 允许管理员为新用户设置默认 AI 提供商。

#### Scenario: 设置默认 AI 提供商
- **WHEN** 管理员配置系统默认 AI 提供商
- **THEN** 系统存储默认配置
- **AND** 新用户在注册时继承此配置

#### Scenario: 锁定 AI 提供商设置
- **WHEN** 管理员启用 "lock_ai_config" 设置
- **THEN** 普通用户无法修改其 AI 提供商设置
- **AND** 所有用户使用系统默认配置
