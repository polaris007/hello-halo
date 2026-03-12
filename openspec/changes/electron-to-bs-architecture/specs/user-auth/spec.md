## ADDED Requirements

### Requirement: 用户登录认证

系统 SHALL 提供用户登录功能，用户通过用户名和密码进行身份验证。

#### Scenario: 成功登录
- **WHEN** 用户提交正确的用户名和密码
- **THEN** 系统返回认证 Token 并建立会话

#### Scenario: 登录失败
- **WHEN** 用户提交错误的用户名或密码
- **THEN** 系统返回 401 错误并提示"用户名或密码错误"

#### Scenario: 账户锁定
- **WHEN** 用户连续 5 次输入错误密码
- **THEN** 系统锁定账户 15 分钟

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

### Requirement: Token 机制

系统 SHALL 使用 Bearer Token 进行 API 认证。

#### Scenario: Token 格式
- **WHEN** 系统生成 Token
- **THEN** Token 为 32 字节的随机字符串，以十六进制编码

#### Scenario: Token 传递
- **WHEN** 客户端调用受保护的 API
- **THEN** 客户端在 Authorization 头中携带 "Bearer {token}"

#### Scenario: Token 无效
- **WHEN** 请求携带无效或过期的 Token
- **THEN** 系统返回 401 错误

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
