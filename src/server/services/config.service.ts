/**
 * 服务端配置管理
 * 读取和管理 server.json 配置文件
 */

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface ServerConfig {
  server: {
    host: string
    port: number
  }
  auth: {
    mode: 'normal' | 'disabled' | 'simple' | 'header'
    simpleToken?: string
    headerName?: string
  }
  aiSources: {
    providers: Array<{
      id: string
      name: string
      type: string
      apiKey: string
      baseUrl: string
    }>
  }
  data: {
    basePath: string
    maxUploadSize: number
  }
}

const DEFAULT_CONFIG: ServerConfig = {
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
    maxUploadSize: 100 * 1024 * 1024 // 100MB
  }
}

let config: ServerConfig | null = null
let configPath: string | null = null

/**
 * 加载配置文件
 */
export function loadConfig(customPath?: string): ServerConfig {
  if (config) {
    return config
  }

  // 尝试从自定义路径或默认路径加载
  const pathsToTry = [
    customPath,
    process.env.HALO_CONFIG_PATH,
    join(process.cwd(), 'server.json'),
    join(homedir(), '.halo', 'server.json')
  ].filter(Boolean) as string[]

  for (const path of pathsToTry) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8')
        config = { ...DEFAULT_CONFIG, ...JSON.parse(content) }
        configPath = path
        console.log(`[Config] Loaded from ${path}`)
        return config!
      } catch (error) {
        console.warn(`[Config] Failed to parse ${path}:`, error)
      }
    }
  }

  // 没有找到配置文件，使用默认配置
  console.log('[Config] No config file found, using defaults')
  config = { ...DEFAULT_CONFIG }
  return config!
}

/**
 * 保存配置文件
 */
export function saveConfig(updates: Partial<ServerConfig>): ServerConfig {
  if (!config) {
    config = { ...DEFAULT_CONFIG }
  }

  // 深度合并配置
  config = mergeConfig(config, updates)

  // 如果有配置文件路径，保存更改
  if (configPath) {
    try {
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
      console.log(`[Config] Saved to ${configPath}`)
    } catch (error) {
      console.error('[Config] Failed to save config:', error)
    }
  }

  return config
}

/**
 * 获取配置值
 */
export function getConfig(): ServerConfig {
  if (!config) {
    return loadConfig()
  }
  return config
}

/**
 * 从环境变量覆盖配置
 */
export function applyEnvOverrides(): ServerConfig {
  if (!config) {
    config = { ...DEFAULT_CONFIG }
  }

  // 服务器配置
  if (process.env.HALO_HOST) {
    config.server.host = process.env.HALO_HOST
  }
  if (process.env.HALO_PORT) {
    config.server.port = parseInt(process.env.HALO_PORT, 10)
  }

  // 认证配置
  if (process.env.HALO_AUTH_MODE) {
    config.auth.mode = process.env.HALO_AUTH_MODE as any
  }
  if (process.env.HALO_AUTH_SIMPLE_TOKEN) {
    config.auth.simpleToken = process.env.HALO_AUTH_SIMPLE_TOKEN
  }
  if (process.env.HALO_AUTH_HEADER_NAME) {
    config.auth.headerName = process.env.HALO_AUTH_HEADER_NAME
  }

  // 数据目录
  if (process.env.HALO_DATA_DIR) {
    config.data.basePath = process.env.HALO_DATA_DIR
  }

  // AI 提供商配置（从环境变量）
  if (process.env.HALO_ANTHROPIC_API_KEY) {
    ensureProvider('anthropic', 'Anthropic', 'anthropic', 'https://api.anthropic.com')
    const provider = config.aiSources.providers.find(p => p.id === 'anthropic')
    if (provider) {
      provider.apiKey = process.env.HALO_ANTHROPIC_API_KEY
    }
  }

  if (process.env.HALO_OPENAI_API_KEY) {
    ensureProvider('openai', 'OpenAI', 'openai', 'https://api.openai.com')
    const provider = config.aiSources.providers.find(p => p.id === 'openai')
    if (provider) {
      provider.apiKey = process.env.HALO_OPENAI_API_KEY
    }
  }

  return config
}

/**
 * 确保 AI 提供商存在
 */
function ensureProvider(id: string, name: string, type: string, baseUrl: string) {
  if (!config) {
    config = { ...DEFAULT_CONFIG }
  }

  const exists = config.aiSources.providers.some(p => p.id === id)
  if (!exists) {
    config.aiSources.providers.push({ id, name, type, apiKey: '', baseUrl })
  }
}

/**
 * 深度合并配置
 */
function mergeConfig(base: ServerConfig, updates: Partial<ServerConfig>): ServerConfig {
  const result = { ...base }

  if (updates.server) {
    result.server = { ...base.server, ...updates.server }
  }

  if (updates.auth) {
    result.auth = { ...base.auth, ...updates.auth }
  }

  if (updates.data) {
    result.data = { ...base.data, ...updates.data }
  }

  if (updates.aiSources) {
    result.aiSources = { ...base.aiSources, ...updates.aiSources }
  }

  return result
}
