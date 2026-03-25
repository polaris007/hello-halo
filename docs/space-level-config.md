# 空间级配置指南

本文档说明如何在空间级别配置 Claude Agent SDK 的行为，包括配置生效机制和优先级规则。

## 配置层级

Halo 支持两个层级的配置：

| 层级 | 路径 | 作用范围 | 配置来源 |
|------|------|----------|----------|
| 用户级 | `{HALO_DATA_DIR}/claude-config/` | 所有空间共享 | `settingSources: 'user'` |
| 项目级 | `<空间工作目录>/.claude/` | 仅当前空间 | `settingSources: 'project'` |

### 配置加载顺序

1. 先加载用户级配置
2. 再加载项目级配置
3. **项目级配置会覆盖用户级同名配置**

---

## 项目级配置目录结构

在空间的**工作目录**下创建 `.claude/` 目录：

```
<空间工作目录>/
├── .claude/
│   ├── settings.json          # 项目级设置
│   ├── CLAUDE.md              # 项目指令（注入到系统提示）
│   └── skills/                # 项目级技能
│       └── my-skill/
│           └── SKILL.md
└── CLAUDE.md                  # 项目指令（根目录也生效）
```

---

## 会生效的配置

### Skills（技能）

```
.claude/skills/<skill-name>/SKILL.md
```

项目级技能只在当前空间的对话中生效，与用户级技能合并加载。

### CLAUDE.md（项目指令）

放在 `.claude/CLAUDE.md` 或空间根目录的 `CLAUDE.md` 都会生效。内容会被注入到系统提示中，用于定义项目特定的行为规则。

### settings.json 配置项

| 配置项 | 是否生效 | 说明 |
|--------|----------|------|
| `mcpServers` | ✅ 会合并/覆盖 | MCP 服务器配置 |
| `allowedTools` | ⚠️ 追加 | 追加到 Halo 默认允许列表 |
| `disallowedTools` | ✅ 生效 | 禁用的工具列表 |
| `hooks` | ✅ 生效 | 钩子配置 |
| `permissions` | ✅ 生效 | 权限配置 |
| `env` | ✅ 生效 | 环境变量 |

#### 示例 settings.json

```json
{
  "mcpServers": {
    "my-project-server": {
      "command": "node",
      "args": ["./mcp-server.js"]
    }
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["echo 'Running bash command'"]
      }
    ]
  },
  "permissions": {
    "allow": ["Read(**)", "Edit(**)"],
    "deny": ["Bash(rm -rf **)"]
  }
}
```

---

## 不会生效或被覆盖的配置

以下配置由 Halo 自身控制，项目级设置可能不会生效：

| 配置项 | 原因 |
|--------|------|
| `model` | Halo 通过 API 参数控制模型 |
| `maxTurns` | Halo 在 SDK 选项中设置 |
| `systemPrompt` | Halo 使用自定义系统提示 |
| `sandbox` | Halo 写入用户级 settings.json |

---

## 常见场景

### 场景 1：为项目添加专用 MCP Server

在空间目录创建 `.claude/settings.json`：

```json
{
  "mcpServers": {
    "project-database": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://localhost/myproject"
      }
    }
  }
}
```

### 场景 2：添加项目特定技能

```
<空间目录>/.claude/skills/api-docs/SKILL.md
```

```markdown
# API Documentation Generator

Generate API documentation for this project's REST endpoints.

## Usage
When asked to document an API, analyze the route handlers and generate
OpenAPI 3.0 specification files.
```

### 场景 3：覆盖用户级 MCP Server

如果用户级配置了名为 `database` 的 MCP Server，项目级再配置同名 Server 会覆盖它：

```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["./custom-db-client.js"]
    }
  }
}
```

---

## 注意事项

1. **目录名称**：项目级配置目录是 `.claude`（以点开头），不是 `claude-config`
2. **空间隔离**：每个空间的配置是独立的，不会互相影响
3. **合并策略**：数组类型配置（如 `allowedTools`）会合并，对象类型配置（如 `mcpServers`）同名会覆盖
4. **生效时机**：配置修改后需要开始新对话才能生效

---

## 相关文档

- [Claude Config 路径配置](./claude-config-path.md) - 用户级配置目录说明
- [系统提示参考](./system-prompt-reference.md) - 系统提示构建细节
