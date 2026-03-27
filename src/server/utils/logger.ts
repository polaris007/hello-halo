/**
 * Server Logger Utility
 *
 * Provides structured logging to file with timestamps.
 * Logs are written to {data-dir}/logs/server.log by default,
 * configurable via HALO_LOG_DIR environment variable.
 */

import { appendFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync, renameSync } from 'fs'
import { join, parse } from 'path'
import { getConfig } from '../services/config.service.js'

// Log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

// Logger configuration (legacy, some values still used)
const LOG_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
}

// Log level mapping
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

// Get current log level from environment variable
function getLogLevel(): LogLevel {
  const level = process.env.HALO_LOG_LEVEL?.toUpperCase() as LogLevel
  if (level && LOG_LEVELS[level] !== undefined) {
    return level
  }
  // Default to INFO
  return 'INFO'
}

// Get console output setting from environment variable
function getConsoleOutput(): boolean {
  if (process.env.HALO_LOG_CONSOLE !== undefined) {
    const value = process.env.HALO_LOG_CONSOLE.toLowerCase()
    return value === 'true' || value === '1' || value === 'yes'
  }
  // Default to true
  return true
}

// Get log retention days from environment variable
function getLogRetentionDays(): number {
  if (process.env.HALO_LOG_RETENTION_DAYS) {
    const days = parseInt(process.env.HALO_LOG_RETENTION_DAYS, 10)
    if (!isNaN(days) && days > 0) {
      return days
    }
  }
  // Default to 7 days
  return 7
}

// Get maximum log file size from environment variable (in MB)
function getMaxLogFileSizeMB(): number {
  if (process.env.HALO_LOG_MAX_SIZE_MB) {
    const size = parseInt(process.env.HALO_LOG_MAX_SIZE_MB, 10)
    if (!isNaN(size) && size > 0) {
      return size
    }
  }
  // Default to 100 MB
  return 100
}

// Get maximum log file size in bytes
function getMaxLogFileSizeBytes(): number {
  return getMaxLogFileSizeMB() * 1024 * 1024
}

// Clean up old log files
function cleanupOldLogFiles(): void {
  try {
    const logDir = getLogDir()
    if (!existsSync(logDir)) {
      return
    }

    const retentionDays = getLogRetentionDays()
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    const files = readdirSync(logDir)
    for (const file of files) {
      // Check if file matches server log pattern
      if (file.startsWith('server-') && file.endsWith('.log')) {
        try {
          // Extract date from filename: server-YYYY-MM-DD.log
          const dateStr = file.substring(7, 17) // Get YYYY-MM-DD part
          const fileDate = new Date(dateStr)

          // Delete if older than retention period
          if (fileDate < cutoffDate) {
            const filePath = join(logDir, file)
            unlinkSync(filePath)
            originalConsole.log(`[Logger] Deleted old log file: ${file}`)
          }
        } catch (error) {
          // Skip files with invalid date format
          continue
        }
      }
    }
  } catch (error) {
    // Don't throw, just log error
    originalConsole.error('[Logger] Error cleaning up old log files:', error)
  }
}

// Check if current log file exceeds size limit and rotate if needed
function checkAndRotateBySize(): void {
  try {
    const currentPath = getLogFilePath()
    if (!existsSync(currentPath)) {
      return
    }

    const stats = statSync(currentPath)
    const maxSize = getMaxLogFileSizeBytes()

    if (stats.size >= maxSize) {
      // File is too large, rotate it
      const now = new Date()
      const timestamp = now.toISOString().replace(/[:.]/g, '-')
      const newPath = currentPath.replace(/\.log$/, `-${timestamp}.log`)

      // Rename current file
      renameSync(currentPath, newPath)

      // Reset current log file path to force creation of new file
      currentLogFilePath = null
      originalConsole.log(`[Logger] Rotated log file due to size limit: ${newPath}`)
    }
  } catch (error) {
    // Don't throw, just log error
    originalConsole.error('[Logger] Error checking log file size:', error)
  }
}

// Check if a message at given level should be logged
function shouldLog(level: LogLevel): boolean {
  const currentLevel = getLogLevel()
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

// Default log directory (can be changed at runtime)
let customLogDir: string | null = null

/**
 * Set custom log directory
 * @param dir - Absolute path to log directory
 */
export function setLogDirectory(dir: string): void {
  customLogDir = dir
  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  // Reset log file path so it will be recalculated
  currentLogFilePath = null
}

/**
 * Get current log directory
 */
export function getLogDirectory(): string {
  if (customLogDir) {
    return customLogDir
  }
  // Use HALO_LOG_DIR environment variable if set
  if (process.env.HALO_LOG_DIR) {
    return process.env.HALO_LOG_DIR
  }
  // Default: use {cwd}/logs (unified with api-xxxx.log and ai-xxxx.log)
  return join(process.cwd(), 'logs')
}

let currentLogFilePath: string | null = null
let currentLogDate: string | null = null

/**
 * Get log directory path
 */
function getLogDir(): string {
  return getLogDirectory()
}

/**
 * Get current date in YYYY-MM-DD format
 */
function getCurrentDate(): string {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

/**
 * Get log file path with date-based rotation
 */
function getLogFilePath(): string {
  const currentDate = getCurrentDate()

  // Check if we need to update the log file path (new day or first time)
  if (!currentLogFilePath || currentLogDate !== currentDate) {
    const logDir = getLogDir()
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }

    // Clean up old log files when starting a new day
    if (currentLogDate && currentLogDate !== currentDate) {
      cleanupOldLogFiles()
    }

    currentLogDate = currentDate
    currentLogFilePath = join(logDir, `server-${currentDate}.log`)
  }

  return currentLogFilePath
}

/**
 * Format timestamp using local system time
 */
function formatLocalTimestamp(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  const ms = String(now.getMilliseconds()).padStart(3, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}`
}

/**
 * Format timestamp (alias for formatLocalTimestamp for backward compatibility)
 */
function formatTimestamp(): string {
  return formatLocalTimestamp()
}

/**
 * Format log message
 */
function formatLogMessage(level: LogLevel, message: string, ...args: unknown[]): string {
  const timestamp = formatTimestamp()
  let formattedMessage = message

  // Replace placeholders with args
  if (args.length > 0) {
    let argIndex = 0
    formattedMessage = message.replace(/%[sdj%]/g, (match) => {
      if (match === '%%') return '%'
      if (argIndex >= args.length) return match
      const arg = args[argIndex++]
      if (match === '%s') return String(arg)
      if (match === '%d') return Number(arg).toString()
      if (match === '%j') {
        try {
          return JSON.stringify(arg)
        } catch {
          return '[Circular]'
        }
      }
      return match
    })

    // Append remaining args as JSON
    if (argIndex < args.length) {
      const remaining = args.slice(argIndex)
      for (const arg of remaining) {
        if (typeof arg === 'object') {
          try {
            formattedMessage += ' ' + JSON.stringify(arg)
          } catch {
            formattedMessage += ' [Object]'
          }
        } else {
          formattedMessage += ' ' + String(arg)
        }
      }
    }
  }

  return `[${timestamp}] [${level}] ${formattedMessage}`
}

// Store original console methods for internal use
let originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
}

/**
 * Write log to file
 */
function writeToFile(formattedMessage: string): void {
  try {
    // Check if we need to rotate by size before writing
    checkAndRotateBySize()

    const logPath = getLogFilePath()
    appendFileSync(logPath, formattedMessage + '\n', 'utf-8')
  } catch (error) {
    // Fallback to original console.error if file writing fails
    // Must use original to avoid infinite recursion
    originalConsole.error('[Logger] Failed to write to log file:', error)
  }
}

/**
 * Log message at specified level
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  // Check if this log level should be recorded
  if (!shouldLog(level)) {
    return
  }

  const formattedMessage = formatLogMessage(level, message, ...args)

  // Write to file
  writeToFile(formattedMessage)

  // Also output to console if enabled
  // Must use original console methods to avoid infinite recursion
  if (getConsoleOutput()) {
    const consoleMethod = level === 'ERROR' ? originalConsole.error :
                          level === 'WARN' ? originalConsole.warn :
                          level === 'DEBUG' ? originalConsole.debug : originalConsole.log
    consoleMethod(formattedMessage)
  }
}

/**
 * Logger interface
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => log('DEBUG', message, ...args),
  info: (message: string, ...args: unknown[]) => log('INFO', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('WARN', message, ...args),
  error: (message: string, ...args: unknown[]) => log('ERROR', message, ...args),

  /**
   * Get current log file path for debugging
   */
  getLogFilePath: () => getLogFilePath(),

  /**
   * Set log directory
   */
  setLogDirectory: (dir: string) => setLogDirectory(dir),

  /**
   * Get current log directory
   */
  getLogDirectory: () => getLogDirectory()
}

/**
 * Override console methods to use logger
 * Call this at application startup
 */
export function overrideConsole(): void {
  // Save original console methods before overriding
  originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  }

  console.log = (...args: unknown[]) => {
    const message = args.shift() as string
    logger.info(message, ...args)
  }

  console.info = (...args: unknown[]) => {
    const message = args.shift() as string
    logger.info(message, ...args)
  }

  console.warn = (...args: unknown[]) => {
    const message = args.shift() as string
    logger.warn(message, ...args)
  }

  console.error = (...args: unknown[]) => {
    const message = args.shift() as string
    logger.error(message, ...args)
  }

  console.debug = (...args: unknown[]) => {
    const message = args.shift() as string
    logger.debug(message, ...args)
  }

  // Log startup message using original console to avoid recursion during init
  originalConsole.log('=== Server Logger Initialized ===')
  originalConsole.log('Log directory:', getLogDirectory())
  originalConsole.log('Current log file:', getLogFilePath())
  originalConsole.log('Log level:', getLogLevel())
  originalConsole.log('Console output:', getConsoleOutput() ? 'enabled' : 'disabled')
}

export default logger
