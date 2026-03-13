#!/usr/bin/env node

/**
 * Halo 配置迁移脚本
 * 从旧版 Electron 配置迁移到 B/S 架构配置
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const OLD_CONFIG_PATH = join(homedir(), '.halo', 'config.json')
const NEW_CONFIG_PATH = join(homedir(), '.halo', 'server.json')

console.log('Halo Configuration Migration Tool')
console.log('==================================')

// 检查旧配置文件
if (!existsSync(OLD_CONFIG_PATH)) {
  console.log('No old config file found at:', OLD_CONFIG_PATH)
  console.log('Migration not needed.')
  process.exit(0)
}

try {
  const oldConfig = JSON.parse(readFileSync(OLD_CONFIG_PATH, 'utf-8'))

  // 创建新配置
  const newConfig = {
    server: {
      host: '127.0.0.1',
      port: 3000
    },
    auth: {
      mode: 'normal',
      simpleToken: undefined,
      headerName: 'X-User-Id'
    },
    aiSources: {
      providers: []
    },
    data: {
      basePath: join(homedir(), '.halo'),
      maxUploadSize: 100 * 1024 * 1024
    }
  }

  // 迁移 AI 提供商配置
  if (oldConfig.aiSources) {
    if (Array.isArray(oldConfig.aiSources)) {
      newConfig.aiSources.providers = oldConfig.aiSources.map(source => ({
        id: source.id || source.provider,
        name: source.name || source.provider,
        type: source.type || 'custom',
        apiKey: source.apiKey || '',
        baseUrl: source.baseUrl || 'https://api.anthropic.com'
      }))
    }
  }

  // 迁移其他配置
  if (oldConfig.layout) {
    newConfig.layout = oldConfig.layout
  }

  // 保存新配置
  writeFileSync(NEW_CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8')

  console.log('✓ Config migrated successfully!')
  console.log('  Old config:', OLD_CONFIG_PATH)
  console.log('  New config:', NEW_CONFIG_PATH)
  console.log('')
  console.log('Note: The old config file is preserved. You can delete it manually if needed.')

} catch (error) {
  console.error('✗ Migration failed:', error.message)
  process.exit(1)
}
