## 1. API 端点修改

- [x] 1.1 修改 `POST /api/v1/ai-sources/sources` 接口，移除 API-Key 源的数据库存储
- [x] 1.2 修改 `PUT /api/v1/ai-sources/sources/:id` 接口，移除 API-Key 源的数据库更新
- [x] 1.3 修改 `DELETE /api/v1/ai-sources/sources/:id` 接口，移除 API-Key 源的数据库删除
- [x] 1.4 确保 OAuth 源的数据库操作保持不变

## 2. 读取逻辑优化

- [x] 2.1 修改 `configs.routes.ts` 中的 `mergeAISourcesWithFileConfig` 函数，直接从文件获取 API-Key 配置
- [x] 2.2 确保函数正确合并文件中的 API-Key 配置和数据库中的 OAuth 配置
- [x] 2.3 测试配置读取功能，确保 API 响应格式保持一致

## 3. 启动逻辑调整

- [x] 3.1 修改 `src/server/index.ts`，移除启动时的数据库到文件的迁移逻辑
- [x] 3.2 确保系统启动时直接从文件读取 API-Key 配置

## 4. 测试验证

- [x] 4.1 测试 API-Key 配置的添加操作
- [x] 4.2 测试 API-Key 配置的更新操作
- [x] 4.3 测试 API-Key 配置的删除操作
- [x] 4.4 测试配置读取功能，验证 API 响应格式
- [x] 4.5 测试 OAuth 配置的正常运行
- [x] 4.6 测试系统启动时的行为

## 5. 代码清理

- [x] 5.1 移除不必要的数据库操作代码
- [x] 5.2 清理注释和文档
- [x] 5.3 确保代码风格一致
