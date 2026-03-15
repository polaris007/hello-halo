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
  consoleOutput: true,
  localStorageKey: 'halo-client-logs',
  maxLocalStorageEntries: 5000, // Max entries to keep in localStorage
  sendBatchSize: 100, // Send logs to server when this many accumulate
  sendIntervalMs: 10000 // Send logs to server every 10 seconds
  // Note: For larger storage needs, consider adding IndexedDB support as a fallback
  // when localStorage is unavailable or reaches its size limit (~5MB)
}

// Store original console methods for internal use
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug
}

// In-memory log storage (cache)
const logEntries: LogEntry[] = []

// Initialize log entries from localStorage if available
// TODO: Consider adding IndexedDB fallback for larger storage needs
function loadLogsFromLocalStorage(): void {
  try {
    const stored = localStorage.getItem(LOG_CONFIG.localStorageKey)
    if (stored) {
      const parsed = JSON.parse(stored) as LogEntry[]
      logEntries.push(...parsed)

      // Trim to maxLocalStorageEntries
      if (logEntries.length > LOG_CONFIG.maxLocalStorageEntries) {
        logEntries.splice(0, logEntries.length - LOG_CONFIG.maxLocalStorageEntries)
      }
    }
  } catch (error) {
    console.error('Failed to load logs from localStorage:', error)
  }
}

// Save logs to localStorage
// TODO: Consider adding IndexedDB fallback for larger storage needs
function saveLogsToLocalStorage(): void {
  try {
    // Keep only the most recent entries
    const logsToSave = logEntries.slice(-LOG_CONFIG.maxLocalStorageEntries)
    localStorage.setItem(LOG_CONFIG.localStorageKey, JSON.stringify(logsToSave))
  } catch (error) {
    // localStorage might be full or unavailable
    console.error('Failed to save logs to localStorage:', error)
  }
}

// Clean old logs from localStorage to prevent overflow
function cleanupLocalStorage(): void {
  try {
    const stored = localStorage.getItem(LOG_CONFIG.localStorageKey)
    if (stored) {
      const parsed = JSON.parse(stored) as LogEntry[]
      if (parsed.length > LOG_CONFIG.maxLocalStorageEntries) {
        const trimmed = parsed.slice(-LOG_CONFIG.maxLocalStorageEntries)
        localStorage.setItem(LOG_CONFIG.localStorageKey, JSON.stringify(trimmed))
      }
    }
  } catch (error) {
    console.error('Failed to cleanup localStorage:', error)
  }
}

// Periodic cleanup to prevent localStorage overflow
function startPeriodicCleanup(): void {
  // Cleanup every 5 minutes
  setInterval(() => {
    cleanupLocalStorage()

    // Also check if we're approaching localStorage limit (5MB)
    try {
      const stored = localStorage.getItem(LOG_CONFIG.localStorageKey)
      if (stored && stored.length > 4 * 1024 * 1024) { // 4MB threshold
        // Remove oldest 20% of logs
        const parsed = JSON.parse(stored) as LogEntry[]
        const keepCount = Math.floor(parsed.length * 0.8)
        const trimmed = parsed.slice(-keepCount)
        localStorage.setItem(LOG_CONFIG.localStorageKey, JSON.stringify(trimmed))
        console.warn(`Trimmed logs due to localStorage size: ${parsed.length} -> ${trimmed.length}`)
      }
    } catch (error) {
      console.error('Failed to check localStorage size:', error)
    }
  }, 5 * 60 * 1000) // 5 minutes
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
 * Add log entry to in-memory cache and localStorage
 */
function addLogEntry(level: LogLevel, message: string, args: unknown[]): void {
  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    message,
    args
  }

  // Check if we're offline
  if (!isOnline) {
    // Queue for sending when back online
    pendingOfflineLogs.push(entry)
    console.log('[Logger] Offline: log queued for later sending')
  } else {
    // Normal online processing
    logEntries.push(entry)
  }

  // Always save to localStorage for persistence
  saveLogsToLocalStorage()

  // Trim old entries if exceeding max (only for online logs)
  if (logEntries.length > LOG_CONFIG.maxEntries) {
    logEntries.shift()
  }

  // Also trim pending offline logs
  if (pendingOfflineLogs.length > LOG_CONFIG.maxEntries) {
    pendingOfflineLogs.shift()
  }
}

/**
 * Log message at specified level
 */
function log(level: LogLevel, message: string, ...args: unknown[]): void {
  // Add to in-memory cache
  addLogEntry(level, message, args)

  // Output to console if enabled
  // Must use original console methods to avoid infinite recursion
  if (LOG_CONFIG.consoleOutput) {
    const formattedMessage = formatLogMessage(level, message, args)
    const consoleMethod = level === 'ERROR' ? originalConsole.error :
                          level === 'WARN' ? originalConsole.warn :
                          level === 'DEBUG' ? originalConsole.debug : originalConsole.log
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
 * Clear all logs from memory cache and localStorage
 */
export function clearLogs(): void {
  logEntries.length = 0
  try {
    localStorage.removeItem(LOG_CONFIG.localStorageKey)
  } catch (error) {
    console.error('Failed to clear logs from localStorage:', error)
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
  // Save original console methods before overriding
  // originalConsole is already declared at the top, just update it
  Object.assign(originalConsole, {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  })

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

  // Load existing logs from localStorage
  loadLogsFromLocalStorage()

  // Start periodic cleanup
  startPeriodicCleanup()

  // Start periodic log sending to server
  startPeriodicLogSending()

  // Log startup message using original console to avoid recursion during init
  originalConsole.log('=== Client Logger Initialized ===')
  originalConsole.log(`Loaded ${logEntries.length} logs from localStorage`)
}

// Track logs that have been sent to server
const sentLogs = new Set<string>() // Using timestamp+message as unique identifier
const failedLogs = new Map<string, { entry: LogEntry; retryCount: number; lastAttempt: number }>()
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000 // 5 seconds

// Track network status
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
let pendingOfflineLogs: LogEntry[] = []

// Network status detection
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    isOnline = true
    console.log('[Logger] Network is online, sending pending logs')
    sendPendingOfflineLogs()
  })

  window.addEventListener('offline', () => {
    isOnline = false
    console.log('[Logger] Network is offline, logs will be queued')
  })
}

// Send logs that were queued while offline
function sendPendingOfflineLogs(): void {
  if (pendingOfflineLogs.length > 0 && isOnline) {
    console.log(`[Logger] Sending ${pendingOfflineLogs.length} logs queued during offline period`)
    // Add pending logs to the main log entries for sending
    pendingOfflineLogs.forEach(log => {
      const id = `${log.timestamp}-${log.message}`
      if (!sentLogs.has(id)) {
        logEntries.push(log)
      }
    })
    pendingOfflineLogs = []
    // Trigger immediate send
    sendLogsToServer()
  }
}

// Send logs to server with retry mechanism
async function sendLogsToServer(): Promise<void> {
  // Don't send if offline
  if (!isOnline) {
    console.log('[Logger] Skipping send - offline')
    return
  }

  if (logEntries.length === 0 && failedLogs.size === 0) {
    return
  }

  // Collect logs to send: new logs + failed logs that need retry
  const logsToSend: LogEntry[] = []
  const newSentIds: string[] = []
  const retryIds: string[] = []

  // Add new logs
  for (const log of logEntries) {
    const id = `${log.timestamp}-${log.message}`
    if (!sentLogs.has(id) && !failedLogs.has(id)) {
      logsToSend.push(log)
      newSentIds.push(id)
    }
  }

  // Add failed logs that need retry
  const now = Date.now()
  for (const [id, failedLog] of failedLogs) {
    // Check if it's time to retry (exponential backoff)
    const delay = Math.min(RETRY_DELAY_MS * Math.pow(2, failedLog.retryCount), 30000) // Max 30 seconds
    if (now - failedLog.lastAttempt >= delay) {
      logsToSend.push(failedLog.entry)
      retryIds.push(id)
    }
  }

  if (logsToSend.length === 0) {
    return
  }

  // Limit batch size
  const batch = logsToSend.slice(0, LOG_CONFIG.sendBatchSize)
  const batchNewIds = newSentIds.slice(0, LOG_CONFIG.sendBatchSize)
  const batchRetryIds = retryIds.slice(0, LOG_CONFIG.sendBatchSize - batchNewIds.length)

  try {
    // In a real implementation, this would be an API call
    // For now, we'll just simulate it
    console.log(`[Logger] Sending ${batch.length} logs to server (${batchNewIds.length} new, ${batchRetryIds.length} retry)`)

    // Mark as sent
    batchNewIds.forEach(id => sentLogs.add(id))
    batchRetryIds.forEach(id => {
      sentLogs.add(id)
      failedLogs.delete(id)
    })

    // In production, you would make an actual API call:
    // const response = await fetch('/api/v1/logs/client', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ logs: batch })
    // })
    // if (!response.ok) {
    //   throw new Error(`Failed to send logs: ${response.status}`)
    // }
  } catch (error) {
    console.error('Failed to send logs to server:', error)

    // Handle retry logic
    const now = Date.now()
    batchNewIds.forEach(id => {
      const log = logEntries.find(l => `${l.timestamp}-${l.message}` === id)
      if (log) {
        failedLogs.set(id, {
          entry: log,
          retryCount: 1,
          lastAttempt: now
        })
      }
      sentLogs.delete(id)
    })

    batchRetryIds.forEach(id => {
      const failedLog = failedLogs.get(id)
      if (failedLog && failedLog.retryCount < MAX_RETRIES) {
        failedLogs.set(id, {
          ...failedLog,
          retryCount: failedLog.retryCount + 1,
          lastAttempt: now
        })
      } else if (failedLog) {
        // Max retries reached, give up
        console.warn(`[Logger] Giving up on log after ${MAX_RETRIES} retries: ${id}`)
        failedLogs.delete(id)
      }
      sentLogs.delete(id)
    })
  }
}

// Start periodic log sending
function startPeriodicLogSending(): void {
  // Check network status and send pending logs if coming back online
  if (isOnline && pendingOfflineLogs.length > 0) {
    sendPendingOfflineLogs()
  }

  // Send immediately if we have enough logs
  if (isOnline && logEntries.length >= LOG_CONFIG.sendBatchSize) {
    sendLogsToServer()
  }

  // Then send periodically (only when online)
  setInterval(() => {
    if (isOnline && (logEntries.length > 0 || pendingOfflineLogs.length > 0)) {
      sendLogsToServer()
    }
  }, LOG_CONFIG.sendIntervalMs)
}

export default logger
