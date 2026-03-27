/**
 * LLM Config Service - Server-side LLM configuration file management
 *
 * Manages the llm-config.json file which stores API-key based AI source configurations.
 * This service handles reading, writing, and validating the configuration file.
 *
 * File Location: <project-startup-directory>/llm-config.json
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

// ============================================================================
// Configuration Cache
// ============================================================================

let configCache: LLMConfigFile | null = null
let configCacheTime = 0
const CONFIG_CACHE_TTL = 5000 // 5 seconds

// ============================================================================
// Configuration Path Management
// ============================================================================

/**
 * Get the default LLM config file path
 * Returns: <project-startup-directory>/llm-config.json
 */
export function getDefaultLLMConfigPath(): string {
  return join(process.cwd(), LLM_CONFIG_FILENAME)
}

/**
 * Get the LLM config file path
 * Tries custom path first, then default
 */
export function getLLMConfigPath(customPath?: string): string {
  return customPath || getDefaultLLMConfigPath()
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
 */
export function saveLLMConfig(config: LLMConfigFile, customPath?: string): {
  success: boolean
  error?: string
} {
  const configPath = getLLMConfigPath(customPath)

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
 * Get current config (loads if not cached)
 */
export function getLLMConfig(): LLMConfigFile {
  if (!configCache) {
    return loadLLMConfig()
  }
  return configCache
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

  // Add source
  config.sources.push(source)

  // Auto-select if no current source
  if (!config.currentId) {
    config.currentId = source.id
  }

  return saveLLMConfig(config)
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

  config.sources[sourceIndex] = updatedSource
  return saveLLMConfig(config)
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

  // If this is the current source, switch to another or null
  if (config.currentId === sourceId) {
    config.currentId = config.sources.length > 1
      ? config.sources.find(s => s.id !== sourceId)?.id || null
      : null
  }

  // Remove source
  config.sources.splice(sourceIndex, 1)

  return saveLLMConfig(config)
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

  config.currentId = sourceId
  return saveLLMConfig(config)
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Check if migration is needed
 * Returns true if there are API-Key sources in database that are not in file
 */
export function needsMigration(dbSources: any[]): boolean {
  if (!dbSources || dbSources.length === 0) {
    return false
  }

  const llmConfig = getLLMConfig()
  const apiKeySourcesInDb = dbSources.filter(s => s.authType === 'api-key')

  if (apiKeySourcesInDb.length === 0) {
    return false
  }

  // Check if any API-Key source in DB is not in file
  for (const source of apiKeySourcesInDb) {
    if (!llmConfig.sources.some(s => s.id === source.id)) {
      return true
    }
  }

  return false
}

/**
 * Migrate API-Key sources from database to file
 * Returns migration result with count of migrated sources
 */
export function migrateFromDatabase(dbSources: any[], dbCurrentId: string | null): {
  success: boolean
  migratedCount: number
  errors: string[]
} {
  const errors: string[] = []
  let migratedCount = 0

  const llmConfig = getLLMConfig()
  const apiKeySourcesInDb = dbSources.filter(s => s.authType === 'api-key')

  for (const source of apiKeySourcesInDb) {
    try {
      // Skip if already in file
      if (llmConfig.sources.some(s => s.id === source.id)) {
        continue
      }

      // Create LLM config source
      const llmSource: LLMConfigSource = {
        id: source.id,
        name: source.name,
        provider: source.provider,
        apiUrl: source.apiUrl,
        apiKey: source.apiKey || '',
        apiType: source.apiType,
        model: source.model,
        availableModels: source.availableModels || [],
        createdAt: source.createdAt,
        updatedAt: source.updatedAt || source.createdAt
      }

      // Validate before adding
      const validation = validateLLMConfigSource(llmSource)
      if (!validation.valid) {
        errors.push(`Source ${source.id}: ${validation.errors.join(', ')}`)
        continue
      }

      llmConfig.sources.push(llmSource)
      migratedCount++

      console.log(`[LLMConfig] Migrated source ${source.id} to file`)
    } catch (error: any) {
      errors.push(`Source ${source.id}: ${error.message}`)
    }
  }

  // Set current source if not set
  if (!llmConfig.currentId && dbCurrentId) {
    const migratedSource = llmConfig.sources.find(s => s.id === dbCurrentId)
    if (migratedSource) {
      llmConfig.currentId = dbCurrentId
    } else if (llmConfig.sources.length > 0) {
      llmConfig.currentId = llmConfig.sources[0].id
    }
  }

  // Save if there were migrations
  if (migratedCount > 0) {
    const saveResult = saveLLMConfig(llmConfig)
    if (!saveResult.success) {
      errors.push(`Failed to save migrated config: ${saveResult.error}`)
      return { success: false, migratedCount: 0, errors }
    }
  }

  return {
    success: errors.length === 0,
    migratedCount,
    errors
  }
}
