/**
 * Client Logger Utility
 *
 * Provides structured logging with timestamps for web environment.
 * Logs are stored in-memory and can be downloaded.
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
  consoleOutput: true
}

// In-memory log storage (cache)
const logEntries: LogEntry[] = []

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

  // Output to console if enabled
  if (LOG_CONFIG.consoleOutput) {
    const formattedMessage = formatLogMessage(level, message, args)
    const consoleMethod = level === 'ERROR' ? console.error :
                          level === 'WARN' ? console.warn :
                          level === 'DEBUG' ? console.debug : console.log
    consoleMethod(formattedMessage)
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
  clearLogs
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
}

export default logger
