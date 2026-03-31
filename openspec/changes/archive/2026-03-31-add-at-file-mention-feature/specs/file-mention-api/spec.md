# 文件提及 API 规范

## 概述

文件提及 API 提供了用于列出空间内工件（文件和文件夹）的端点，启用了聊天界面中的 @ 文件提及功能。此 API 允许用户快速引用项目文件，而无需手动输入完整路径。

## 端点

### GET /api/v1/spaces/{spaceId}/artifacts

**描述：** 列出空间内的工件（文件和文件夹）

**参数：**
- `spaceId` (路径)：空间的 ID
- `depth` (查询，可选)：要扫描的最大深度（默认：5）
- `showHidden` (查询，可选)：是否显示隐藏文件（默认：false）
- `filter` (查询，可选)：文件名的过滤模式

**响应：**
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "string",
      "type": "file" | "folder",
      "path": "string",
      "relativePath": "string",
      "extension": "string",
      "icon": "string",
      "size": number,
      "createdAt": "string",
      "modifiedAt": "string"
    }
  ],
  "metadata": {
    "total": number,
    "truncated": boolean
  }
}
```

**错误响应：**
- `400 Bad Request`：无效参数
- `401 Unauthorized`：用户未认证
- `403 Forbidden`：用户没有访问空间的权限
- `404 Not Found`：空间未找到
- `500 Internal Server Error`：服务器错误

## 数据模型

### 工件

```typescript
interface Artifact {
  id: string;
  name: string;
  type: 'file' | 'folder';
  path: string;
  relativePath: string;
  extension: string;
  icon: string;
  size?: number;
  createdAt: string;
  modifiedAt: string;
}
```

## 缓存

- 实现服务器端内存缓存以存储工件列表
- 当空间中的文件更改时，应使缓存失效
- 缓存键应包含空间 ID、深度和过滤参数
- 设置合理的缓存过期时间（例如，5 分钟）

## 性能要求

- 对于包含 < 1000 个文件的空间，API 响应时间应 < 500ms
- 即使对于较大的空间，最大响应时间也应 < 2s
- 为包含 > 500 个文件的空间实现分页
- 限制最大扫描深度以防止性能问题

## 安全要求

- 在访问文件之前验证空间所有权
- 将文件系统访问限制在空间特定目录
- 清理用户输入以防止路径遍历攻击
- 为权限问题实现适当的错误处理

## 实现说明

- 使用现有的文件系统实用程序进行扫描
- 重用现有的认证中间件
- 与基于空间的授权集成
- 实现文件系统事件监控以进行缓存失效
- 使用带有深度限制的高效递归扫描
