# 用户认证与默认密码设置

## 默认用户信息

Halo 项目在首次启动时会自动创建一个默认的管理员用户：

- **邮箱/用户名**：`admin`
- **角色**：`admin`（管理员权限）

## 默认密码

当前项目配置的默认密码是：`Clqc@1234`

这个密码在 `server.json` 文件的 `auth.defaultPassword` 字段中设置。

## 认证模式

Halo 支持多种认证模式：

### 1. Normal 模式（默认）
- 使用 JWT token 认证
- Access token 有效期：1 小时
- Refresh token 有效期：7 天
- 适合页面访问和需要安全性的场景

### 2. Simple 模式
- 使用固定的 token 认证
- 无需处理 token 过期
- 适合外部系统对接
- 支持多个 token 配置

### 3. Disabled 模式
- 禁用认证
- 所有请求使用默认管理员权限
- 仅用于开发环境

### 4. Header 模式
- 从请求头读取用户 ID
- 适合反向代理集成

## 设置默认密码的方法

有三种方式可以设置默认密码：

### 1. 默认配置

系统默认使用 `Clqc@1234` 作为默认密码，无需额外配置。

### 2. 通过配置文件设置

在项目根目录的 `server.json` 文件中修改 `auth.defaultPassword` 字段：

```json
{
  "auth": {
    "mode": "normal",
    "defaultPassword": "你的密码"
  }
}
```

### 3. 通过环境变量设置

创建 `.env.local` 文件（从 `.env.example` 复制），然后设置 `HALO_DEFAULT_PASSWORD` 环境变量：

```bash
# HALO_DEFAULT_PASSWORD=你的密码
```

**注意**：环境变量的优先级高于配置文件，配置文件的优先级高于默认值。

## Simple 模式配置

### 启用 Simple 模式

在 `server.json` 文件中设置：

```json
{
  "auth": {
    "mode": "simple",
    "simpleToken": "your-token-here"
  }
}
```

### 多 Token 支持

Simple 模式支持配置多个 token，便于多系统对接：

```json
{
  "auth": {
    "mode": "simple",
    "simpleToken": ["system1-token", "system2-token", "system3-token"]
  }
}
```

### 通过环境变量配置

多个 token 用逗号分隔：

```bash
# HALO_AUTH_SIMPLE_TOKEN=token1,token2,token3
```

### 使用方式

外部系统在请求头中添加：

```bash
Authorization: Bearer your-token-here
```

## 密码保存机制

系统会在首次启动时自动将默认密码保存到 `server.json` 配置文件中，确保密码持久化。

## 密码更新

当系统检测到配置文件或环境变量中设置了默认密码时，会自动更新默认管理员用户的密码，确保密码与配置保持一致。

## 安全建议

1. 首次登录后建议立即修改默认密码
2. 使用强密码，包含大小写字母、数字和特殊字符
3. 定期更新密码以提高安全性
4. 不要在代码、日志或文档中暴露密码
5. 考虑使用密码管理工具来安全存储密码
6. Simple 模式下，确保 token 的安全性，定期轮换 token