# User Auth

## Purpose

TBD - 用户登录认证和会话管理能力，提供多种认证模式支持。

## Requirements

### Requirement: 用户注册

系统 SHALL 允许新用户使用邮箱和密码注册。

#### Scenario: 成功注册
- **WHEN** 新用户提交有效的邮箱和密码
- **THEN** 系统创建新用户账户
- **AND** 返回 JWT access token 和 refresh token

#### Scenario: 重复邮箱注册
- **WHEN** 用户尝试使用已存在的邮箱注册
- **THEN** 系统返回 409 Conflict 错误，消息为"Email already registered"

#### Scenario: 邮箱格式无效
- **WHEN** 用户提交格式无效的邮箱
- **THEN** 系统返回 400 Bad Request 错误和验证详情

#### Scenario: 密码强度不足
- **WHEN** 用户提交少于 8 个字符的密码
- **THEN** 系统返回 400 Bad Request 错误，消息为"Password must be at least 8 characters"

### Requirement: 用户登录认证

系统 SHALL 使用邮箱和密码认证用户并发放 JWT token。

#### Scenario: 成功登录
- **WHEN** 用户提交正确的邮箱和密码
- **THEN** 系统返回 JWT access token（有效期 1 小时）和 refresh token（有效期 7 天）
- **AND** 返回用户资料信息

#### Scenario: 登录失败
- **WHEN** 用户提交错误的邮箱或密码
- **THEN** 系统返回 401 Unauthorized 错误，消息为"Invalid credentials"
- **AND** 不透露邮箱是否存在

#### Scenario: 账户锁定
- **WHEN** 用户在 15 分钟内连续 5 次登录失败
- **THEN** 系统锁定账户 30 分钟
- **AND** 返回 423 Locked 错误

### Requirement: Token 刷新

系统 SHALL 允许用户使用 refresh token 刷新 access token。

#### Scenario: 成功刷新 Token
- **WHEN** 用户发送有效的 refresh token 到 /api/v1/auth/refresh
- **THEN** 系统返回新的 access token
- **AND** 返回新的 refresh token（轮换机制）

#### Scenario: Refresh Token 过期
- **WHEN** 用户发送过期的 refresh token
- **THEN** 系统返回 401 Unauthorized 错误
- **AND** 要求用户重新登录

#### Scenario: Refresh Token 已撤销
- **WHEN** 用户发送已撤销的 refresh token（登出后）
- **THEN** 系统返回 401 Unauthorized 错误

### Requirement: 用户登出

系统 SHALL 允许用户登出并使 token 失效。

#### Scenario: 成功登出
- **WHEN** 已认证用户发送登出请求
- **THEN** 系统使 refresh token 失效
- **AND** 将当前 access token 加入黑名单直到过期

### Requirement: 密码修改

系统 SHALL 允许已认证用户修改密码。

#### Scenario: 成功修改密码
- **WHEN** 已认证用户提供当前密码和新密码
- **THEN** 系统验证当前密码
- **AND** 更新密码哈希
- **AND** 使所有现有的 refresh token 失效

#### Scenario: 当前密码错误
- **WHEN** 用户提供错误的当前密码
- **THEN** 系统返回 400 Bad Request 错误，消息为"Current password is incorrect"

### Requirement: JWT 认证中间件

系统 SHALL 在受保护的 API 端点上验证 JWT token。

#### Scenario: 有效 Token
- **WHEN** 请求在 Authorization 头中包含有效的 JWT access token
- **THEN** 系统从 token 中提取 user_id
- **AND** 将用户上下文附加到请求
- **AND** 允许访问端点

#### Scenario: 缺少 Token
- **WHEN** 请求访问受保护端点但没有 Authorization 头
- **THEN** 系统返回 401 Unauthorized 错误

#### Scenario: Token 无效
- **WHEN** 请求包含无效或格式错误的 JWT token
- **THEN** 系统返回 401 Unauthorized 错误

#### Scenario: Token 过期
- **WHEN** 请求包含过期的 JWT access token
- **THEN** 系统返回 401 Unauthorized 错误，代码为"TOKEN_EXPIRED"

### Requirement: 会话管理

系统 SHALL 管理用户会话，支持会话创建、验证和销毁。

#### Scenario: 会话创建
- **WHEN** 用户成功登录
- **THEN** 系统创建会话并返回 Token

#### Scenario: 会话验证
- **WHEN** 请求携带有效的 Authorization 头
- **THEN** 系统允许访问受保护的资源

#### Scenario: 会话过期
- **WHEN** 会话超过 7 天未活动
- **THEN** 系统自动使会话失效

#### Scenario: 主动登出
- **WHEN** 用户点击登出按钮
- **THEN** 系统销毁当前会话并清除客户端 Token

### Requirement: 默认用户创建

系统 SHALL 在首次启动时自动创建默认用户。

#### Scenario: 首次启动无用户
- **WHEN** 系统首次启动且数据库中无用户
- **THEN** 系统自动创建用户名为 "admin" 的默认用户

#### Scenario: 默认密码配置
- **WHEN** 用户未配置默认密码
- **THEN** 系统生成随机密码并输出到日志

#### Scenario: 自定义默认密码
- **WHEN** 用户通过环境变量或配置文件设置默认密码
- **THEN** 系统使用配置的密码创建默认用户

### Requirement: 密码安全

系统 SHALL 安全存储用户密码。

#### Scenario: 密码加密存储
- **WHEN** 用户设置或修改密码
- **THEN** 系统使用 bcrypt 算法加密存储密码

#### Scenario: 密码强度验证
- **WHEN** 用户设置新密码
- **THEN** 系统验证密码长度至少 8 个字符

### Requirement: 系统对接认证模式

系统 SHALL 支持多种认证模式，便于与其他系统集成。

#### Scenario: 正常模式
- **WHEN** 配置文件设置 `auth.mode: "normal"` 或未设置
- **THEN** 系统要求用户登录认证

#### Scenario: 禁用认证模式
- **WHEN** 配置文件设置 `auth.mode: "disabled"`
- **THEN** 系统跳过认证，所有请求视为默认用户

#### Scenario: 简单 Token 模式
- **WHEN** 配置文件设置 `auth.mode: "simple"` 和 `auth.simpleToken: "xxx"`
- **THEN** 系统接受固定 Token 进行认证，并映射到默认用户

#### Scenario: 请求头模式
- **WHEN** 配置文件设置 `auth.mode: "header"` 和 `auth.headerName: "X-User-Id"`
- **THEN** 系统从指定请求头读取用户标识，关联对应用户

#### Scenario: 请求头模式用户不存在
- **WHEN** 请求头中的用户标识在系统中不存在
- **THEN** 系统返回 401 错误并提示"用户不存在"

#### Scenario: 系统对接模式配置
- **WHEN** 用户在配置文件中配置认证模式
- **THEN** 系统在启动时应用配置的认证模式

#### Scenario: 登录页面隐藏
- **WHEN** 认证模式为 "disabled" 或 "header"
- **THEN** 前端不显示登录页面

### Requirement: 认证配置管理

系统 SHALL 提供认证配置的管理接口。

#### Scenario: 查看认证配置
- **WHEN** 管理员请求 GET /api/v1/auth/config
- **THEN** 系统返回当前认证模式（不含敏感信息）

#### Scenario: 修改认证模式
- **WHEN** 管理员通过配置文件修改认证模式并重启服务
- **THEN** 系统应用新的认证模式
