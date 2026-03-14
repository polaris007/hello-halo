/**
 * Client Logger Utility
 *
 * Provides structured logging with timestamps.
 * Logs are sent to main process via IPC and written to file.
 * Log file location: {appDir}/logs/renderer.log
 */

// Log levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

// Log entry interface
export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  args: unknown[]
}

// Logger configuration
const LOG_CONFIG = {
  maxEntries: 1000, // Keep last 1000 entries in memory as cache
  consoleOutput: true,
  fileOutput: true // Send to main process for file writing
}

// In-memory log storage (cache)
const logEntries: LogEntry[] = []

// IPC function type
type IPCLoggerFunction = (level: LogLevel, message: string, args: unknown[]) => Promise<void>

// IPC sender (will be set when available)
let ipcLogger: IPCLoggerFunction | null = null

/**
 * Check if running in Electron with IPC available
 */
function isElectronIPCAvailable(): boolean {
  return typeof window !== 'undefined' &&
         !!(window as any).electron?.ipcRenderer
}

/**
 * Send log to main process via IPC
 */
async function sendLogToMain(level: LogLevel, message: string, args: unknown[]): Promise<void> {
  if (!isElectronIPCAvailable()) {
    return
  }
  try {
    const ipc = (window as any).electron.ipcRenderer
    await ipc.invoke('logger:write', level, message, args)
  } catch (error) {
    // Silently fail - don't create infinite loop
    console.warn('[Logger] Failed to send log to main:', error)
  }
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
 * Add log entry to in-memory cache
 */
function addLogEntry(level: LogLevel, message: string, args: unknown[]): void {
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    message,
    args
  }

  logEntries.push(entry)

  // Trim old entries if exceeding max
  if (logEntries.length > LOG_CONFIG.maxEntries) {
    logEntries.shift()
  }
}

/**
 * Log message at specified level
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  // Add to in-memory cache
  addLogEntry(level, message, args)

  // Send to main process for file writing
  if (LOG_CONFIG.fileOutput && isElectronIPCAvailable()) {
    sendLogToMain(level, message, args).catch(() => {
      // Ignore errors to prevent infinite loops
    })
  }

  // Also output to console if enabled
  if (LOG_CONFIG.consoleOutput) {
    const formattedMessage = formatLogMessage(level, message, args)
    const consoleMethod = level === 'ERROR' ? console.error :
                          level === 'WARN' ? console.warn :
                          level === 'DEBUG' ? console.debug : console.log
    consoleMethod(formattedMessage)
  }
}

/**
 * Get current log file path from main process
 */
export async function getLogPath(): Promise<{ logFile: string; logDirectory: string } | null> {
  if (!isElectronIPCAvailable()) {
    return null
  }
  try {
    const ipc = (window as any).electron.ipcRenderer
    const result = await ipc.invoke('logger:get-path')
    if (result.success) {
      return result.data
    }
    return null
  } catch (error) {
    console.error('[Logger] Failed to get log path:', error)
    return null
  }
}

/**
 * Set custom log directory
 * @param dir - Absolute path to log directory
 */
export async function setLogDirectory(dir: string): Promise<boolean> {
  if (!isElectronIPCAvailable()) {
    console.warn('[Logger] Cannot set log directory: IPC not available')
    return false
  }
  try {
    const ipc = (window as any).electron.ipcRenderer
    const result = await ipc.invoke('logger:set-directory', dir)
    if (result.success) {
      console.log('[Logger] Log directory changed to:', result.data.logDirectory)
      return true
    }
    console.error('[Logger] Failed to set log directory:', result.error)
    return false
  } catch (error) {
    console.error('[Logger] Failed to set log directory:', error)
    return false
  }
}

/**
 * Get all logs from file (via main process)
 */
export async function getLogsFromFile(): Promise<string[] | null> {
  if (!isElectronIPCAvailable()) {
    return null
  }
  try {
    const ipc = (window as any).electron.ipcRenderer
    const result = await ipc.invoke('logger:get-logs')
    if (result.success) {
      return result.data
    }
    return null
  } catch (error) {
    console.error('[Logger] Failed to get logs from file:', error)
    return null
  }
}

/**
 * Clear logs in file (via main process)
 */
export async function clearLogsInFile(): Promise<boolean> {
  if (!isElectronIPCAvailable()) {
    return false
  }
  try {
    const ipc = (window as any).electron.ipcRenderer
    const result = await ipc.invoke('logger:clear')
    return result.success
  } catch (error) {
    console.error('[Logger] Failed to clear logs:', error)
    return false
  }
}

/**
 * Download logs as file (from memory cache)
 */
export function downloadLogs(): void {
  const logContent = logEntries
    .map(entry => `[${entry.timestamp}] [${entry.level}] ${entry.message}`)
    .join('\n')

  const blob = new Blob([logContent], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `halo-client-${new Date().toISOString().split('T')[0]}.log`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Get all log entries from memory cache
 */
export function getLogs(): LogEntry[] {
  return [...logEntries]
}

/**
 * Clear all logs from memory cache
 */
export function clearLogs(): void {
  logEntries.length = 0
}

/**
 * Logger interface
 */
export const logger = {
  debug: (message: string, ...args: unknown[]) => log('DEBUG', message, ...args),
  info: (message: string, ...args: unknown[]) => log('INFO', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('WARN', message, ...args),
  error: (message: string, ...args: unknown[]) => log('ERROR', message, ...args),

  // Utility functions
  downloadLogs,
  getLogs,
  clearLogs,

  // File-based log functions
  getLogPath,
  setLogDirectory,
  getLogsFromFile,
  clearLogsInFile
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
  logger.info('=== Client Logger Initialized ===')

  // Log log file location
  getLogPath().then(path => {
    if (path) {
      logger.info('Log file location: %s', path.logFile)
    }
  }).catch(() => {
    // Ignore
  })
}

export default logger
