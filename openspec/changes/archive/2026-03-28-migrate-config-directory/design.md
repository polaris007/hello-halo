## Context

当前项目的配置文件位置分散：
- `server.json` - 服务端配置，位于项目根目录
- `llm-config.json` - LLM 提供商配置，位于项目根目录

这种分散的方式在 Docker 部署场景下存在以下问题：
1. 需要分别挂载每个配置文件
2. 配置文件与代码目录混合，不便于管理
3. 无法通过一个环境变量统一指定配置目录

本设计将所有配置文件迁移到统一的 `config/` 目录，简化部署和管理。

## Goals / Non-Goals

**Goals:**
- 将所有配置文件统一迁移到 `config/` 目录
- 支持通过环境变量 `HALO_CONFIG_DIR` 指定配置目录
- 简化 Docker 部署时的配置挂载
- 提供平滑的迁移路径，向后兼容旧配置

**Non-Goals:**
- 不改变配置文件的内容格式
- 不增加新的配置项
- 不实现配置热重载功能

## Decisions

### 1. 配置目录默认位置

**决策**: 配置目录默认为 `{cwd}/config/`

**理由**:
- 符合业界常见实践
- 与数据目录 `{cwd}/data/` 形成对应
- Docker 部署时可通过挂载覆盖

**替代方案**:
- `{data-dir}/config/` - 被否决，配置和数据职责不同，应分离
- `/etc/halo/` - 被否决，过于 Linux 特定，不适合开发环境

### 2. 配置文件搜索优先级

**决策**: 配置文件搜索顺序：
1. `HALO_CONFIG_PATH` 环境变量（精确指定文件路径）
2. `{config-dir}/server.json`（新位置）
3. `{cwd}/server.json`（旧位置，兼容）
4. 使用默认配置

**理由**:
- 环境变量优先级最高，便于容器化部署
- 新位置优先于旧位置，引导用户迁移
- 保留旧位置兼容性，避免破坏性变更

### 3. 配置目录与数据目录的关系

**决策**: 配置目录和数据目录独立，互不依赖

**理由**:
- 配置通常是只读的，数据是可读写的
- Docker 场景下可能分别挂载
- 遵循"配置与数据分离"原则

```
项目目录结构:
├── config/                 # 配置目录 (可挂载)
│   ├── server.json        # 服务端配置
│   └── llm-config.json    # LLM 配置
├── data/                   # 数据目录 (可挂载)
│   ├── halo.db            # 数据库
│   ├── logs/              # 日志
│   └── users/             # 用户数据
└── ...
```

### 4. 迁移策略

**决策**: 启动时检测旧配置，输出迁移提示，不自动迁移

**理由**:
- 自动迁移可能造成配置重复或丢失
- 用户可能有意在不同位置维护配置
- 提示信息可引导用户手动迁移

**替代方案**:
- 自动迁移并删除旧文件 - 被否决，风险太大
- 完全不支持旧位置 - 被否决，破坏性变更

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Startup                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. resolveConfigDir()                                       │
│     ├── HALO_CONFIG_DIR env var? ──→ use that               │
│     └── default: {cwd}/config                                │
│                                                              │
│  2. loadConfig()                                             │
│     ├── HALO_CONFIG_PATH env var? ──→ load that file        │
│     ├── {config-dir}/server.json exists? ──→ load it        │
│     ├── {cwd}/server.json exists? ──→ load + warn           │
│     └── none found ──→ use defaults                          │
│                                                              │
│  3. loadLLMConfig()                                          │
│     ├── {config-dir}/llm-config.json exists? ──→ load it    │
│     ├── {cwd}/llm-config.json exists? ──→ load + warn       │
│     └── none found ──→ return empty config                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Risks / Trade-offs

### 风险 1: 用户不知道配置位置变化

**缓解措施**: 启动时检测旧位置配置文件，输出明确的警告日志，提示新位置

### 风险 2: Docker 用户使用旧的挂载配置

**缓解措施**: 更新 docker-compose.yml 示例，文档中说明新的挂载方式

### 风险 3: 相对路径在不同启动目录下解析错误

**缓解措施**: 所有路径在启动时转换为绝对路径并输出日志，便于调试

## Migration Plan

### 阶段 1: 代码修改（本变更）

1. 新增 `resolveConfigDir()` 函数
2. 修改 `loadConfig()` 支持新搜索路径
3. 修改 `loadLLMConfig()` 支持新搜索路径
4. 更新 Dockerfile 创建 config 目录
5. 更新 docker-compose.yml 挂载示例

### 阶段 2: 用户迁移（用户操作）

1. 用户看到启动日志中的迁移提示
2. 手动将 `server.json` 和 `llm-config.json` 移动到 `config/` 目录
3. 更新 Docker 挂载配置

### 回滚策略

如果新版本出现问题：
- 代码回退即可，旧位置配置仍可读取
- 用户无需移动配置文件

## Open Questions

- [ ] 是否需要提供迁移脚本 `npm run migrate-config`？
  - 当前决策：不需要，手动迁移更安全
- [ ] 是否需要支持配置目录不存在时自动创建？
  - 当前决策：不自动创建，避免创建空目录；配置文件由应用创建
