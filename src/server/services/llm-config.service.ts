/**
 * LLM Config Service - Server-side LLM configuration file management
 *
 * Manages the llm-config.json file which stores API-key based AI source configurations.
 * This service handles reading, writing, and validating the configuration file.
 *
 * File Location:
 * - 优先: {config-dir}/llm-config.json（新位置）
 * - 兼容: {cwd}/llm-config.json（旧位置）
 *
 * Design:
 * - JSON format for easy manual editing
 * - Cached reads to avoid frequent file I/O
 * - Validation before save
 * - Error handling for missing/corrupt files
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import {
  LLMConfigFile,
  LLMConfigSource,
  createEmptyLLMConfigFile,
  validateLLMConfigFile,
  validateLLMConfigSource,
  LLM_CONFIG_FILENAME
} from '@shared/types/llm-config'
import { getConfigDir, findConfigFile } from './config-dir.service.js'

// ============================================================================
// Configuration Cache
// ============================================================================

let configCache: LLMConfigFile | null = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 5000 // 5 seconds

// 记录当前使用的配置文件路径
let currentConfigPath: string | null = null

// ============================================================================
// Configuration Path Management
// ============================================================================

/**
 * Get the default LLM config file path (new location in config directory)
 * Returns: {config-dir}/llm-config.json
 */
export function getDefaultLLMConfigPath(): string {
  return join(getConfigDir(), LLM_CONFIG_FILENAME)
}

/**
 * Get the LLM config file path
 * Searches in order: custom path > config-dir > cwd (legacy)
 */
export function getLLMConfigPath(customPath?: string): string {
  // 如果提供了自定义路径，直接使用
  if (customPath) {
    return customPath
  }

  // 如果已经找到过配置文件，返回缓存的路径
  if (currentConfigPath) {
    return currentConfigPath
  }

  // 搜索配置文件
  const found = findConfigFile(LLM_CONFIG_FILENAME)
  if (found) {
    currentConfigPath = found.path
    if (found.isLegacy) {
      console.log(`[LLMConfig] Found ${LLM_CONFIG_FILENAME} in legacy location, consider moving to config/ directory`)
    }
    return found.path
  }

  // 没有找到，返回默认的新位置（用于创建新文件）
  return getDefaultLLMConfigPath()
}

// ============================================================================
// Configuration Loading
// ============================================================================

/**
 * Load LLM config from file
 * Returns empty config if file doesn't exist or is invalid
 */
export function loadLLMConfig(customPath?: string): LLMConfigFile {
  const now = Date.now()
  const configPath = getLLMConfigPath(customPath)

  // Return cached config if still valid
  if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
    return configCache
  }

  // Try to read and parse config file
  try {
    if (!existsSync(configPath)) {
      console.log(`[LLMConfig] Config file not found: ${configPath}, using empty config`)
      configCache = createEmptyLLMConfigFile()
      configCacheTime = now
      return configCache
    }

    const content = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(content) as LLMConfigFile

    // Validate the config
    const validation = validateLLMConfigFile(parsed)
    if (!validation.valid) {
      console.error(`[LLMConfig] Invalid config file: ${validation.errors.join(', ')}`)
      configCache = createEmptyLLMConfigFile()
      configCacheTime = now
      return configCache
    }

    configCache = parsed
    configCacheTime = now
    console.log(`[LLMConfig] Loaded from ${configPath}`)
    return configCache
  } catch (error: any) {
    console.error(`[LLMConfig] Failed to load config:`, error.message)
    configCache = createEmptyLLMConfigFile()
    configCacheTime = now
    return configCache
  }
}

/**
 * Save LLM config to file
 * Creates backup before overwriting
 * Always saves to the default location (config/llm-config.json) unless customPath is provided
 */
export function saveLLMConfig(config: LLMConfigFile, customPath?: string): {
  success: boolean
  error?: string
} {
  // Always use default path (config/llm-config.json) unless custom path is provided
  // This ensures we don't write to legacy locations
  const configPath = customPath ? customPath : getDefaultLLMConfigPath()

  // Validate config before saving
  const validation = validateLLMConfigFile(config)
  if (!validation.valid) {
    const errorMsg = `Invalid config: ${validation.errors.join(', ')}`
    console.error(`[LLMConfig] ${errorMsg}`)
    return { success: false, error: errorMsg }
  }

  try {
    // Ensure directory exists
    const dir = dirname(configPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // Create backup if file exists
    if (existsSync(configPath)) {
      const backupPath = configPath + '.bak'
      try {
        const existingContent = readFileSync(configPath, 'utf-8')
        writeFileSync(backupPath, existingContent, 'utf-8')
        console.log(`[LLMConfig] Backup created: ${backupPath}`)
      } catch (backupError) {
        console.warn(`[LLMConfig] Failed to create backup:`, backupError)
      }
    }

    // Write new config
    const content = JSON.stringify(config, null, 2)
    writeFileSync(configPath, content, 'utf-8')
    console.log(`[LLMConfig] Saved to ${configPath}`)

    // Update currentConfigPath to ensure subsequent operations use this path
    // This is critical when saving a new file for the first time
    currentConfigPath = configPath

    // Update cache
    configCache = config
    configCacheTime = Date.now()

    return { success: true }
  } catch (error: any) {
    console.error(`[LLMConfig] Failed to save config:`, error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Get current config (loads if not cached or cache expired)
 */
export function getLLMConfig(): LLMConfigFile {
  return loadLLMConfig()
}

/**
 * Clear config cache
 * Call this when config is updated externally
 */
export function clearLLMConfigCache(): void {
  configCache = null
  configCacheTime = 0
  console.log('[LLMConfig] Cache cleared')
}

// ============================================================================
// Source Management Helpers
// ============================================================================

/**
 * Get a source by ID
 */
export function getLLMSourceByIdFromConfig(sourceId: string): LLMConfigSource | null {
  const config = getLLMConfig()
  return config.sources.find(s => s.id === sourceId) || null
}

/**
 * Get current active source
 */
export function getCurrentLLMSourceFromConfig(): LLMConfigSource | null {
  const config = getLLMConfig()
  if (!config.currentId) return null
  return config.sources.find(s => s.id === config.currentId) || null
}

/**
 * Add a new source
 */
export function addLLMSource(source: LLMConfigSource): {
  success: boolean
  error?: string
} {
  const config = getLLMConfig()

  // Check for duplicate ID
  if (config.sources.some(s => s.id === source.id)) {
    return { success: false, error: 'Source with this ID already exists' }
  }

  // Validate source
  const validation = validateLLMConfigSource(source)
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(', ') }
  }

  // Create a new config object to avoid mutating the cache directly
  const newConfig: LLMConfigFile = {
    ...config,
    sources: [...config.sources, source]
  }

  // Auto-select if no current source
  if (!newConfig.currentId) {
    newConfig.currentId = source.id
  }

  return saveLLMConfig(newConfig)
}

/**
 * Update an existing source
 */
export function updateLLMSource(sourceId: string, updates: Partial<LLMConfigSource>): {
  success: boolean
  error?: string
} {
  const config = getLLMConfig()

  const sourceIndex = config.sources.findIndex(s => s.id === sourceId)
  if (sourceIndex === -1) {
    return { success: false, error: 'Source not found' }
  }

  // Update source
  const updatedSource = {
    ...config.sources[sourceIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  }

  // Validate updated source
  const validation = validateLLMConfigSource(updatedSource)
  if (!validation.valid) {
    return { success: false, error: validation.errors.join(', ') }
  }

  // Create a new config object to avoid mutating the cache directly
  const newConfig: LLMConfigFile = {
    ...config,
    sources: config.sources.map((s, index) =>
      index === sourceIndex ? updatedSource : s
    )
  }

  return saveLLMConfig(newConfig)
}

/**
 * Delete a source
 */
export function deleteLLMSource(sourceId: string): {
  success: boolean
  error?: string
} {
  const config = getLLMConfig()

  const sourceIndex = config.sources.findIndex(s => s.id === sourceId)
  if (sourceIndex === -1) {
    return { success: false, error: 'Source not found' }
  }

  // Create new sources array without the deleted source
  const newSources = config.sources.filter(s => s.id !== sourceId)

  // If this is the current source, switch to another or null
  let newCurrentId = config.currentId
  if (config.currentId === sourceId) {
    newCurrentId = newSources.length > 0 ? newSources[0].id : null
  }

  // Create a new config object to avoid mutating the cache directly
  const newConfig: LLMConfigFile = {
    ...config,
    sources: newSources,
    currentId: newCurrentId
  }

  return saveLLMConfig(newConfig)
}

/**
 * Set current source
 */
export function setCurrentLLMSource(sourceId: string): {
  success: boolean
  error?: string
} {
  const config = getLLMConfig()

  // Check if source exists
  if (!config.sources.some(s => s.id === sourceId)) {
    return { success: false, error: 'Source not found' }
  }

  // Create a new config object to avoid mutating the cache directly
  const newConfig: LLMConfigFile = {
    ...config,
    currentId: sourceId
  }

  return saveLLMConfig(newConfig)
}

// ============================================================================
// Migration Functions
// ============================================================================

/**
 * Check if database sources need migration to file
 * Returns true if there are API-key sources in the database that should be migrated
 */
export function needsMigration(dbSources: any[]): boolean {
  return dbSources.some(s => s.authType === 'api-key' && s.apiKey)
}

/**
 * Migrate API-key sources from database to file
 * This is used for upgrading from older versions that stored API keys in database
 */
export function migrateFromDatabase(
  dbSources: any[],
  currentId: string | null
): {
  success: boolean
  migratedCount: number
  errors: string[]
} {
  const errors: string[] = []
  let migratedCount = 0

  // Get existing file config
  const config = getLLMConfig()

  // Start with existing sources
  const newSources = [...config.sources]

  // Add API-key sources from database to file
  for (const dbSource of dbSources) {
    if (dbSource.authType === 'api-key' && dbSource.apiKey) {
      // Check if already exists in file
      if (newSources.some(s => s.id === dbSource.id)) {
        continue
      }

      // Add to new sources array
      newSources.push({
        id: dbSource.id,
        name: dbSource.name,
        provider: dbSource.provider,
        apiUrl: dbSource.apiUrl || dbSource.baseUrl || '',
        apiKey: dbSource.apiKey,
        apiType: dbSource.apiType,
        model: dbSource.model,
        availableModels: dbSource.availableModels || [],
        createdAt: dbSource.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
      migratedCount++
    }
  }

  // Create a new config object to avoid mutating the cache directly
  const newConfig: LLMConfigFile = {
    ...config,
    sources: newSources,
    // Set currentId if not already set
    currentId: config.currentId || currentId
  }

  // Save the merged config
  const result = saveLLMConfig(newConfig)
  if (!result.success) {
    errors.push(result.error || 'Failed to save config')
  }

  return {
    success: result.success,
    migratedCount,
    errors
  }
}
