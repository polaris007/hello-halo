/**
 * Logger IPC Handlers
 *
 * Handles client-side logging to file from the renderer process.
 * Logs are written to {appDir}/logs/renderer.log (separate from server.log)
 */

import { ipcMain } from 'electron'
import { appendFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getHaloDir } from '../services/config.service'

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
 * Get current log directory
 */
function getLogDirectory(): string {
  if (customLogDir) {
    return customLogDir
  }
  return join(getHaloDir(), 'logs')
}

/**
 * Get log file path for renderer logs
 */
function getLogFilePath(): string {
  return join(getLogDirectory(), 'renderer.log')
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
function formatLogMessage(level: LogLevel, message: string, args: unknown[]): string {
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
    const logDir = getLogDirectory()
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    const logPath = getLogFilePath()
    appendFileSync(logPath, formattedMessage + '\n', 'utf-8')
  } catch (error) {
    // Fallback to console if file writing fails
    console.error('[RendererLogger] Failed to write to log file:', error)
  }
}

/**
 * Log message at specified level
 */
function log(level: LogLevel, message: string, args: unknown[]): void {
  const formattedMessage = formatLogMessage(level, message, args)

  // Write to file
  writeToFile(formattedMessage)

  // Also output to console if enabled
  if (LOG_CONFIG.consoleOutput) {
    const prefix = `[Renderer] [${level}]`
    switch (level) {
      case 'ERROR':
        console.error(prefix, message, ...args)
        break
      case 'WARN':
        console.warn(prefix, message, ...args)
        break
      case 'DEBUG':
        console.debug(prefix, message, ...args)
        break
      default:
        console.log(prefix, message, ...args)
    }
  }
}

export function registerLoggerHandlers(): void {
  // Write log entry from renderer
  ipcMain.handle('logger:write', (_event, level: LogLevel, message: string, args: unknown[]) => {
    try {
      log(level, message, args)
      return { success: true }
    } catch (error) {
      console.error('[LoggerIPC] Failed to write log:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get current log file path
  ipcMain.handle('logger:get-path', () => {
    return {
      success: true,
      data: {
        logFile: getLogFilePath(),
        logDirectory: getLogDirectory()
      }
    }
  })

  // Set custom log directory
  ipcMain.handle('logger:set-directory', (_event, dir: string) => {
    try {
      customLogDir = dir
      // Ensure directory exists
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      console.log('[LoggerIPC] Log directory changed to:', dir)
      return {
        success: true,
        data: {
          logDirectory: dir,
          logFile: getLogFilePath()
        }
      }
    } catch (error) {
      console.error('[LoggerIPC] Failed to set log directory:', error)
      return { success: false, error: String(error) }
    }
  })

  // Get all logs (read from file)
  ipcMain.handle('logger:get-logs', () => {
    try {
      const logPath = getLogFilePath()
      if (!existsSync(logPath)) {
        return { success: true, data: [] }
      }
      const content = require('fs').readFileSync(logPath, 'utf-8')
      const lines = content.split('\n').filter((line: string) => line.trim())
      return { success: true, data: lines }
    } catch (error) {
      console.error('[LoggerIPC] Failed to read logs:', error)
      return { success: false, error: String(error) }
    }
  })

  // Clear logs
  ipcMain.handle('logger:clear', () => {
    try {
      const logPath = getLogFilePath()
      if (existsSync(logPath)) {
        require('fs').writeFileSync(logPath, '', 'utf-8')
      }
      return { success: true }
    } catch (error) {
      console.error('[LoggerIPC] Failed to clear logs:', error)
      return { success: false, error: String(error) }
    }
  })

  console.log('[LoggerIPC] Logger handlers registered')
}
