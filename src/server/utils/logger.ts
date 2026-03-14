/**
 * Server Logger Utility
 *
 * Provides structured logging to file with timestamps.
 * Logs are written to {appDir}/logs/server.log
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// Log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

// Logger configuration
const LOG_CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  consoleOutput: true
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
  logFilePath = null
}

/**
 * Get current log directory
 */
export function getLogDirectory(): string {
  if (customLogDir) {
    return customLogDir
  }
  // Default: use HALO_DATA_DIR env var or fallback to ~/.halo
  const baseDir = process.env.HALO_DATA_DIR
    ? process.env.HALO_DATA_DIR
    : join(process.env.HOME || process.env.USERPROFILE || '.', '.halo')
  return join(baseDir, 'logs')
}

let logFilePath: string | null = null

/**
 * Get log directory path
 */
function getLogDir(): string {
  return getLogDirectory()
}

/**
 * Get log file path
 */
function getLogFilePath(): string {
  if (logFilePath) return logFilePath
  const logDir = getLogDir()
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  logFilePath = join(logDir, 'server.log')
  return logFilePath
}

/**
 * Format timestamp
 */
function formatTimestamp(): string {
  const now = new Date()
  return now.toISOString()
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

/**
 * Write log to file
 */
function writeToFile(formattedMessage: string): void {
  try {
    const logPath = getLogFilePath()
    appendFileSync(logPath, formattedMessage + '\n', 'utf-8')
  } catch (error) {
    // Fallback to console if file writing fails
    console.error('[Logger] Failed to write to log file:', error)
  }
}

/**
 * Log message at specified level
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  const formattedMessage = formatLogMessage(level, message, ...args)

  // Write to file
  writeToFile(formattedMessage)

  // Also output to console if enabled
  if (LOG_CONFIG.consoleOutput) {
    const consoleMethod = level === 'ERROR' ? console.error :
                          level === 'WARN' ? console.warn :
                          level === 'DEBUG' ? console.debug : console.log
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
   * Get log file path for debugging
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
  const originalLog = console.log
  const originalInfo = console.info
  const originalWarn = console.warn
  const originalError = console.error
  const originalDebug = console.debug

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

  // Log startup message
  logger.info('=== Server Logger Initialized ===')
  logger.info('Log file: %s', getLogFilePath())
}

export default logger
