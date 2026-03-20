# Claude Config 路径配置指南

本指南说明如何配置 `claude-config` 目录的存储位置。

## 目录结构

`claude-config` 是 Claude Agent SDK 的配置和数据目录，它始终位于 **Halo 数据目录**下：

```
{HALO_DATA_DIR}/claude-config/
├── settings.json          # SDK 全局设置
├── .claude.json           # 用户配置缓存
├── debug/                 # 调试日志
├── projects/              # 项目会话历史
├── shell-snapshots/       # Shell 环境快照
└── todos/                 # 待办事项状态
```

因此，要改变 `claude-config` 的位置，只需改变 **Halo 数据目录**即可。

---

## 配置方法（三种方式）

### 方式 1：环境变量（推荐）⭐

设置 `HALO_DATA_DIR` 环境变量。

#### Windows (PowerShell)
```powershell
# 临时设置（当前终端有效）
$env:HALO_DATA_DIR="D:\my-halo-data"

# 启动应用
npm run dev
```

#### Windows (CMD)
```cmd
# 临时设置
set HALO_DATA_DIR=D:\my-halo-data

# 启动应用
npm run dev
```

#### Linux / macOS
```bash
# 临时设置
export HALO_DATA_DIR=/home/user/my-halo-data

# 启动应用
npm run dev
```

#### 永久设置（推荐）

**Windows**:
1. 右键"此电脑" → "属性" → "高级系统设置"
2. 点击"环境变量"
3. 在"用户变量"或"系统变量"中添加：
   - 变量名: `HALO_DATA_DIR`
   - 变量值: `D:\my-halo-data`

**Linux/macOS**:
在 `~/.bashrc` 或 `~/.zshrc` 中添加：
```bash
export HALO_DATA_DIR=/home/user/my-halo-data
```

---

### 方式 2：配置文件

在 `server.json` 配置文件中设置 `data.basePath`。

#### 步骤
1. 找到或创建 `server.json` 文件（默认在 `{cwd}/server.json` 或 `{data-dir}/server.json`）
2. 添加或修改 `data.basePath` 配置：

```json
{
  "data": {
    "basePath": "D:\\my-halo-data",
    "maxUploadSize": 104857600
  }
}
```

**注意**：Windows 路径中的反斜杠需要转义为 `\\`。

---

### 方式 3：使用默认路径

如果不设置任何配置，默认使用：
```
{当前工作目录}/data/claude-config
```

例如，如果在 `G:\Workplace\hello-halo` 目录下运行 `npm run dev`，则路径为：
```
G:\Workplace\hello-halo\data\claude-config
```

---

## 优先级

配置的优先级从高到低：

1. **环境变量** `HALO_DATA_DIR`（最高优先级）
2. **配置文件** `server.json` 中的 `data.basePath`
3. **默认值** `{cwd}/data`（最低优先级）

---

## 完整示例

### 示例 1：使用环境变量

```powershell
# 设置数据目录到 D 盘
$env:HALO_DATA_DIR="D:\halo-data"

# 启动应用
npm run dev
```

最终路径：
```
D:\halo-data\claude-config\
```

### 示例 2：使用配置文件

创建 `server.json`：
```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 3000
  },
  "data": {
    "basePath": "/home/user/halo-data"
  }
}
```

启动应用：
```bash
npm run dev
```

最终路径：
```
/home/user/halo-data/claude-config/
```

---

## 注意事项

1. **自动创建目录**
   - 如果指定的数据目录不存在，应用会自动创建
   - `claude-config` 子目录也会自动创建

2. **权限要求**
   - 确保应用对指定目录有读写权限
   - 启动时会自动检查写入权限

3. **迁移现有数据**
   - 如果要迁移现有数据，只需将原 `data` 目录下的所有内容复制到新位置
   - 或者使用 `node scripts/migrate-data-dir.js` 脚本（如有）

4. **查看当前配置**
   - 启动时会在日志中显示数据目录来源：
     ```
     [Config] Data directory: D:\halo-data (from HALO_DATA_DIR environment variable)
     ```

---

## 相关文件

- `src/server/services/config.service.ts` - 数据目录解析逻辑
- `src/server/services/agent/sdk-config.ts` - Claude Config 目录设置
- `server.json.example` - 配置文件示例
