/**
 * 配置目录服务
 *
 * 统一管理应用配置文件的目录位置，支持通过环境变量自定义配置目录，
 * 简化 Docker 部署时的配置挂载。
 *
 * 配置文件搜索优先级：
 * 1. HALO_CONFIG_PATH 环境变量（精确指定文件路径）
 * 2. {config-dir}/server.json（新位置）
 * 3. {cwd}/server.json（旧位置，兼容）
 * 4. 使用默认配置
 */

import { existsSync } from 'fs'
import { join, resolve } from 'path'

// 默认配置目录：应用启动目录下的 config 子目录
const DEFAULT_CONFIG_DIR = join(process.cwd(), 'config')

// 配置目录来源追踪
let configDir: string | null = null
let configDirSource: string = 'default'

/**
 * 解析配置目录路径
 *
 * 优先级：环境变量 HALO_CONFIG_DIR > 默认值 ./config
 *
 * @returns 配置目录的绝对路径
 */
export function resolveConfigDir(): string {
  // 1. 检查环境变量（可能由启动参数设置）
  if (process.env.HALO_CONFIG_DIR) {
    configDir = resolve(process.env.HALO_CONFIG_DIR)
    configDirSource = 'HALO_CONFIG_DIR environment variable'
    return configDir
  }

  // 2. 使用默认值
  configDir = DEFAULT_CONFIG_DIR
  configDirSource = 'default (cwd/config)'
  return configDir
}

/**
 * 获取配置目录路径
 * 如果尚未解析，会自动调用 resolveConfigDir()
 */
export function getConfigDir(): string {
  if (!configDir) {
    return resolveConfigDir()
  }
  return configDir
}

/**
 * 获取配置目录来源描述
 */
export function getConfigDirSource(): string {
  return configDirSource
}

/**
 * 检查配置目录是否存在
 */
export function configDirExists(): boolean {
  return existsSync(getConfigDir())
}

/**
 * 检测旧配置位置
 *
 * 检查项目根目录是否存在旧的配置文件（server.json 或 llm-config.json），
 * 同时配置目录中不存在对应文件。
 *
 * @returns 旧配置文件检测结果
 */
export function detectLegacyConfig(): {
  serverJson: boolean
  llmConfigJson: boolean
  legacyPath: string
} {
  const cwd = process.cwd()
  const configDirPath = getConfigDir()

  const result = {
    serverJson: false,
    llmConfigJson: false,
    legacyPath: cwd
  }

  // 检查 server.json
  const legacyServerJson = join(cwd, 'server.json')
  const newServerJson = join(configDirPath, 'server.json')

  if (existsSync(legacyServerJson) && !existsSync(newServerJson)) {
    result.serverJson = true
  }

  // 检查 llm-config.json
  const legacyLlmConfig = join(cwd, 'llm-config.json')
  const newLlmConfig = join(configDirPath, 'llm-config.json')

  if (existsSync(legacyLlmConfig) && !existsSync(newLlmConfig)) {
    result.llmConfigJson = true
  }

  return result
}

/**
 * 输出配置目录初始化日志
 */
export function logConfigDirInit(): void {
  const dir = getConfigDir()
  const source = getConfigDirSource()

  if (configDirExists()) {
    console.log(`[Config] Config directory: ${dir} (from ${source})`)
  } else {
    console.log(`[Config] Config directory not found: ${dir}`)

    // 检测旧配置位置并输出迁移提示
    const legacy = detectLegacyConfig()
    if (legacy.serverJson) {
      console.log(`[Config] Found server.json in legacy location (${legacy.legacyPath}), consider moving to ${dir}/ directory`)
    }
    if (legacy.llmConfigJson) {
      console.log(`[Config] Found llm-config.json in legacy location (${legacy.legacyPath}), consider moving to ${dir}/ directory`)
    }
  }
}

/**
 * 构建配置文件搜索路径列表
 *
 * @param filename 配置文件名（如 server.json, llm-config.json）
 * @returns 按优先级排序的路径列表
 */
export function buildConfigSearchPaths(filename: string): string[] {
  const paths: string[] = []

  // 1. HALO_CONFIG_PATH 环境变量指定的路径（仅对 server.json 有效）
  if (filename === 'server.json' && process.env.HALO_CONFIG_PATH) {
    paths.push(resolve(process.env.HALO_CONFIG_PATH))
  }

  // 2. 配置目录中的文件（新位置）
  paths.push(join(getConfigDir(), filename))

  // 3. 项目根目录中的文件（旧位置，向后兼容）
  paths.push(join(process.cwd(), filename))

  return paths
}

/**
 * 查找配置文件
 *
 * 按优先级搜索配置文件，返回第一个存在的路径
 *
 * @param filename 配置文件名
 * @returns 找到的配置文件路径，如果都没找到则返回 null
 */
export function findConfigFile(filename: string): { path: string; isLegacy: boolean } | null {
  const paths = buildConfigSearchPaths(filename)

  for (let i = 0; i < paths.length; i++) {
    if (existsSync(paths[i])) {
      // 索引 2（项目根目录）是旧位置
      const isLegacy = i === 2
      return { path: paths[i], isLegacy }
    }
  }

  return null
}
