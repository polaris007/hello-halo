# 配置文件迁移指南

本指南帮助您将配置文件从旧位置迁移到新的统一配置目录。

## 背景

从版本 X.X.X 开始，Halo 使用统一的 `config/` 目录管理所有配置文件。这带来以下好处：

- Docker 部署时只需挂载一个目录
- 配置文件集中管理，更清晰
- 支持环境变量和命令行参数指定配置目录

## 配置目录结构

```
config/
├── server.json        # 服务器配置
├── llm-config.json    # LLM 提供商配置
└── ...                # 其他配置文件
```

## 迁移步骤

### 桌面版用户

1. **创建配置目录**
   ```bash
   mkdir config
   ```

2. **移动配置文件**
   ```bash
   # 如果存在根目录的配置文件
   mv server.json config/
   mv llm-config.json config/
   ```

3. **重启 Halo**

### Docker 用户

1. **创建本地配置目录**
   ```bash
   mkdir -p ./config
   ```

2. **复制或创建配置文件**
   ```bash
   # 如果有现有配置
   cp server.json ./config/
   cp llm-config.json ./config/

   # 或使用示例配置
   cp config/server.example.json ./config/server.json
   cp config/llm-config.example.json ./config/llm-config.json
   ```

3. **更新 docker-compose.yml**
   ```yaml
   services:
     halo:
       volumes:
         # 添加配置目录挂载
         - ./config:/app/config:ro
         # 数据目录
         - halo-data:/app/data
       environment:
         - HALO_CONFIG_DIR=/app/config
   ```

4. **重启容器**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

## 向后兼容

Halo 仍然支持从旧位置读取配置文件，但会输出迁移提示日志：

```
[INFO] Found legacy config file at /path/to/server.json
[INFO] Consider moving it to the config directory: /path/to/config/server.json
```

配置文件搜索顺序：
1. 环境变量 `HALO_CONFIG_PATH` 指定的路径（仅 server.json）
2. `{config-dir}/server.json`
3. `{data-dir}/server.json`
4. `{cwd}/server.json`（旧位置，兼容模式）

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `HALO_CONFIG_DIR` | 配置目录路径 | `./config` |
| `HALO_CONFIG_PATH` | server.json 完整路径（优先级最高） | - |

## 命令行参数

```bash
# 指定配置目录
node server.js --config-dir /path/to/config

# 或使用环境变量
HALO_CONFIG_DIR=/path/to/config node server.js
```

## 常见问题

### Q: 迁移后配置丢失？

A: 检查配置文件是否正确移动到 `config/` 目录。启动时日志会显示配置目录位置：

```
Config directory: /path/to/config (from default)
```

### Q: Docker 容器启动失败？

A: 确保配置文件挂载正确且文件存在：

```bash
# 检查容器日志
docker logs halo

# 验证挂载
docker exec halo ls -la /app/config
```

### Q: 想继续使用旧配置位置？

A: Halo 会自动从旧位置读取配置，但建议迁移到新的配置目录以便于管理。

## 需要帮助？

如有问题，请在 [GitHub Issues](https://github.com/openkursar/hello-halo/issues) 提交反馈。
