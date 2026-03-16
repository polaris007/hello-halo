/**
 * LLM Config File - Type Definitions
 *
 * This module defines types for the llm-config.json file format.
 * This file stores API-key based AI source configurations separately from the database.
 *
 * File Location: <project-startup-directory>/llm-config.json
 *
 * Design:
 * - JSON format for easy manual editing
 * - Versioned for future format upgrades
 * - Compatible with AISource structure to minimize conversion
 */

import type { ModelOption } from './ai-sources'

// ============================================================================
// LLM Config File Types
// ============================================================================

/**
 * A single LLM source configuration in the file
 * Similar to AISource but simplified for file storage
 */
export interface LLMConfigSource {
  /** Unique identifier, UUID format */
  id: string
  /** Display name */
  name: string
  /** Provider ID (e.g., 'anthropic', 'openai', 'deepseek') */
  provider: string
  /** API endpoint URL */
  apiUrl: string
  /** API Key */
  apiKey: string
  /** API type for OpenAI compatible providers */
  apiType?: 'chat_completions' | 'responses' | 'anthropic_passthrough'
  /** Currently selected model ID */
  model: string
  /** Available models list */
  availableModels: ModelOption[]
  /** Creation timestamp (ISO 8601) */
  createdAt: string
  /** Last update timestamp (ISO 8601) */
  updatedAt: string
}

/**
 * LLM Config File structure
 * Stored at <project-startup-directory>/llm-config.json
 */
export interface LLMConfigFile {
  /** Schema version, currently 1 */
  version: 1
  /** Currently active source ID, null if not configured */
  currentId: string | null
  /** All configured API-key sources */
  sources: LLMConfigSource[]
}

// ============================================================================
// Constants
// ============================================================================

/** Current version of LLM config file format */
export const LLM_CONFIG_VERSION = 1

/** Default file name for LLM config */
export const LLM_CONFIG_FILENAME = 'llm-config.json'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty LLM config file structure
 */
export function createEmptyLLMConfigFile(): LLMConfigFile {
  return {
    version: LLM_CONFIG_VERSION,
    currentId: null,
    sources: []
  }
}

/**
 * Validate LLM config source has required fields
 */
export function validateLLMConfigSource(source: Partial<LLMConfigSource>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (!source.id) {
    errors.push('Missing required field: id')
  }
  if (!source.name) {
    errors.push('Missing required field: name')
  }
  if (!source.provider) {
    errors.push('Missing required field: provider')
  }
  if (!source.apiUrl) {
    errors.push('Missing required field: apiUrl')
  } else {
    // Validate URL format
    if (!source.apiUrl.startsWith('http://') && !source.apiUrl.startsWith('https://')) {
      errors.push('apiUrl must start with http:// or https://')
    }
  }
  if (!source.model) {
    errors.push('Missing required field: model')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate entire LLM config file
 */
export function validateLLMConfigFile(config: Partial<LLMConfigFile>): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (config.version === undefined) {
    errors.push('Missing required field: version')
  }

  if (!Array.isArray(config.sources)) {
    errors.push('Missing or invalid field: sources (must be an array)')
  } else {
    // Validate each source
    for (let i = 0; i < config.sources.length; i++) {
      const sourceErrors = validateLLMConfigSource(config.sources[i])
      if (!sourceErrors.valid) {
        errors.push(`Source[${i}]: ${sourceErrors.errors.join(', ')}`)
      }
    }

    // Validate currentId exists in sources
    if (config.currentId && !config.sources.some(s => s.id === config.currentId)) {
      errors.push(`currentId "${config.currentId}" not found in sources`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Get current active source from config file
 */
export function getCurrentLLMSource(config: LLMConfigFile): LLMConfigSource | null {
  if (!config.currentId) return null
  return config.sources.find(s => s.id === config.currentId) || null
}

/**
 * Get source by ID from config file
 */
export function getLLMSourceById(config: LLMConfigFile, id: string): LLMConfigSource | null {
  return config.sources.find(s => s.id === id) || null
}
