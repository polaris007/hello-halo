/**
 * 服务端配置管理
 * 读取和管理 server.json 配置文件
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'

export interface ServerConfig {
  server: {
    host: string
    port: number
  }
  auth: {
    mode: 'normal' | 'disabled' | 'simple' | 'header'
    simpleToken?: string
    headerName?: string
    defaultPassword?: string
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
  aiProvider?: string
  features?: Record<string, boolean>
  limits?: Record<string, number>
}

// 默认数据目录：应用启动目录下的 data 子目录
const DEFAULT_DATA_DIR = join(process.cwd(), 'data')

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
    basePath: DEFAULT_DATA_DIR,
    maxUploadSize: 100 * 1024 * 1024 // 100MB
  },
  aiProvider: undefined,
  features: undefined,
  limits: undefined
}

let config: ServerConfig | null = null
let configPath: string | null = null
let dataDirSource: string = 'default' // 记录数据目录来源

/**
 * 解析数据目录路径
 * 优先级：启动参数(通过环境变量) > 环境变量 > 配置文件 > 默认值
 */
export function resolveDataDir(): string {
  // 1. 检查环境变量（可能由启动参数设置）
  if (process.env.HALO_DATA_DIR) {
    dataDirSource = 'HALO_DATA_DIR environment variable'
    return resolve(process.env.HALO_DATA_DIR)
  }

  // 2. 如果已有配置文件，检查其中的 data.basePath
  if (config?.data?.basePath) {
    dataDirSource = 'server.json config file'
    return resolve(config.data.basePath)
  }

  // 3. 使用默认值
  dataDirSource = 'default (cwd/data)'
  return DEFAULT_DATA_DIR
}

/**
 * 获取数据目录来源描述
 */
export function getDataDirSource(): string {
  return dataDirSource
}

/**
 * 确保数据目录存在
 */
export function ensureDataDir(dataDir: string): void {
  if (!existsSync(dataDir)) {
    try {
      mkdirSync(dataDir, { recursive: true })
      console.log(`[Config] Created data directory: ${dataDir}`)
    } catch (error) {
      console.error(`[Config] Failed to create data directory: ${dataDir}`)
      throw new Error(`Failed to create data directory: ${dataDir}. Please check permissions.`)
    }
  }

  // 检查写入权限
  try {
    const testFile = join(dataDir, '.write-test')
    writeFileSync(testFile, '')
    unlinkSync(testFile)
  } catch {
    throw new Error(`No write permission for data directory: ${dataDir}`)
  }
}

/**
 * 加载配置文件
 */
export function loadConfig(customPath?: string): ServerConfig {
  if (config) {
    return config
  }

  // 先解析数据目录（不依赖配置文件）
  let dataDir = resolveDataDir()

  // 尝试从自定义路径或默认路径加载
  // 优先级：HALO_CONFIG_PATH > {data-dir}/server.json > {cwd}/server.json
  const pathsToTry = [
    customPath,
    process.env.HALO_CONFIG_PATH,
    join(dataDir, 'server.json'),
    join(process.cwd(), 'server.json')
  ].filter(Boolean) as string[]

  for (const path of pathsToTry) {
    if (existsSync(path)) {
      try {
        const content = readFileSync(path, 'utf-8')
        config = { ...DEFAULT_CONFIG, ...JSON.parse(content) }
        configPath = path
        console.log(`[Config] Loaded from ${path}`)

        // 如果配置文件中指定了数据目录，重新解析
        if (config && config.data?.basePath && !process.env.HALO_DATA_DIR) {
          dataDir = resolveDataDir()
        }
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
  if (process.env.HALO_DEFAULT_PASSWORD) {
    config.auth.defaultPassword = process.env.HALO_DEFAULT_PASSWORD
  }

  // 数据目录 - 环境变量覆盖
  if (process.env.HALO_DATA_DIR) {
    config.data.basePath = resolve(process.env.HALO_DATA_DIR)
    dataDirSource = 'HALO_DATA_DIR environment variable'
  }

  // 确保数据目录存在并输出日志
  const dataDir = resolveDataDir()
  ensureDataDir(dataDir)
  console.log(`[Config] Data directory: ${dataDir} (from ${dataDirSource})`)

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

  if (updates.aiProvider !== undefined) {
    result.aiProvider = updates.aiProvider
  }

  if (updates.features) {
    result.features = updates.features
  }

  if (updates.limits) {
    result.limits = updates.limits
  }

  return result
}
