/**
 * Halo - Web Server Entry Point
 * The main entry point for the B/S architecture web server
 */

// ========================================
// CLI ARGUMENT PARSING (must be first)
// ========================================

import { parseArgs } from 'util'

const { values } = parseArgs({
  options: {
    'data-dir': {
      type: 'string',
      short: 'd'
    },
    'config': {
      type: 'string',
      short: 'c'
    }
  },
  strict: false
})

// Set environment variables from CLI arguments (highest priority)
if (values['data-dir'] && typeof values['data-dir'] === 'string') {
  process.env.HALO_DATA_DIR = values['data-dir']
}
if (values['config'] && typeof values['config'] === 'string') {
  process.env.HALO_CONFIG_PATH = values['config']
}

// ========================================
// IMPORTS
// ========================================

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

// ========================================
// CONFIGURATION
// ========================================

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ========================================
// DATABASE INITIALIZATION
// ========================================

import { initializeDatabase, runMigrations, getDatabase, closeDatabase } from './utils/database.js'
import { initializeDefaultUser, cleanupExpiredSessions } from './services/auth.service.js'
import { loadAuthConfig } from './middleware/auth.middleware.js'
import { loadConfig, applyEnvOverrides, getConfig, resolveDataDir, getDataDirSource } from './services/config.service.js'

// ========================================
// LOGGER INITIALIZATION (must be first to capture all logs)
// ========================================

// Initialize logger first to capture all logs
import { overrideConsole, setLogDirectory, getLogDirectory } from './utils/logger.js'

// Set log directory to root logs directory before initializing
const expectedLogDir = join(process.cwd(), 'logs')
setLogDirectory(expectedLogDir)

// Now override console to use logger
overrideConsole()

// ========================================
// CONFIGURATION
// ========================================

// Load configuration
loadConfig()
applyEnvOverrides()

// Get resolved data directory
const HALO_DATA_DIR = resolveDataDir()
const HALO_PORT = parseInt(process.env.HALO_PORT || '3000', 10)
const HALO_HOST = process.env.HALO_HOST || '127.0.0.1'

// Initialize database
initializeDatabase()
runMigrations()

// Initialize default user if no users exist
initializeDefaultUser()

// Cleanup expired sessions on startup
cleanupExpiredSessions()

// Load auth config from environment
const config = getConfig()
loadAuthConfig({
  mode: config.auth.mode,
  simpleToken: config.auth.simpleToken,
  headerName: config.auth.headerName || 'X-User-Id',
})

// ========================================
// MIGRATION: Database to File Config
// ========================================

// Migrate API-Key sources from database to llm-config.json file
import { needsMigration, migrateFromDatabase } from './services/llm-config.service.js'

try {
  const db = getDatabase()
  // Get default user
  const user = db.prepare('SELECT id FROM users WHERE is_default = 1 LIMIT 1').get() as any
    || db.prepare('SELECT id FROM users LIMIT 1').get() as any

  if (user) {
    // Get AI sources config from database
    const row = db.prepare('SELECT value FROM configs WHERE user_id = ? AND key = ?').get(user.id, 'aiSources') as any
    if (row) {
      const dbConfig = JSON.parse(row.value)
      const dbSources = dbConfig.sources || []

      if (needsMigration(dbSources)) {
        console.log('[Migration] Migrating API-Key sources from database to file...')
        const result = migrateFromDatabase(dbSources, dbConfig.currentId)
        if (result.success) {
          console.log(`[Migration] Successfully migrated ${result.migratedCount} sources`)
        } else {
          console.error('[Migration] Migration errors:', result.errors)
        }
      }
    }
  }
} catch (error: any) {
  console.error('[Migration] Failed to migrate:', error.message)
}

// ========================================
// EXPRESS APP SETUP
// ========================================

const app = express()

// Trust proxy (for reverse proxy deployments)
app.set('trust proxy', 1)

// CORS configuration
app.use(cors({
  origin: process.env.HALO_CORS_ORIGIN || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Body parsers
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// HTTP request/response logging middleware
import { requestLoggerMiddleware } from './middleware/request-logger.middleware.js'
app.use(requestLoggerMiddleware)

// ========================================
// API ROUTES
// ========================================

import { router as authRoutes } from './routes/auth.routes.js'
import { router as spacesRoutes } from './routes/spaces.routes.js'
import { router as conversationsRoutes } from './routes/conversations.routes.js'
import { router as configsRoutes } from './routes/configs.routes.js'
import { router as filesRoutes } from './routes/files.routes.js'
import { router as aiSourcesRoutes } from './routes/ai-sources.routes.js'
import { router as agentRoutes } from './routes/agent.routes.js'
import { router as appsRoutes } from './routes/apps.routes.js'
import { router as storeRoutes } from './routes/store.routes.js'
import { router as searchRoutes } from './routes/search.routes.js'
import { router as notifyChannelsRoutes } from './routes/notify-channels.routes.js'
import { router as systemRoutes } from './routes/system.routes.js'
import { router as filesystemRoutes } from './routes/filesystem.routes.js'
import { router as terminalRoutes } from './routes/terminal.routes.js'
import { router as adminRoutes } from './routes/admin.routes.js'
import { router as logsRoutes } from './routes/logs.routes.js'
import { initializeWebSocket } from './services/websocket.service.js'
import { setWebSocketService } from './services/agent/helpers.js'
import * as websocketServiceModule from './services/websocket.service.js'

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/spaces', spacesRoutes)
app.use('/api/v1/spaces', conversationsRoutes)
app.use('/api/v1/configs', configsRoutes)
app.use('/api/v1/ai-sources', aiSourcesRoutes)
app.use('/api/v1/agent', agentRoutes)
app.use('/api/v1/apps', appsRoutes)
app.use('/api/v1/store', storeRoutes)
app.use('/api/v1/search', searchRoutes)
app.use('/api/v1/notify-channels', notifyChannelsRoutes)
app.use('/api/v1/system', systemRoutes)
app.use('/api/v1/filesystem', filesystemRoutes)
app.use('/api/v1/terminal', terminalRoutes)
app.use('/api/v1/admin', adminRoutes)
app.use('/api/v1/logs', logsRoutes)
app.use('/api/v1', filesRoutes)

// ========================================
// HEALTH CHECK ENDPOINTS
// ========================================

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/ready', async (_req, res) => {
  try {
    const db = getDatabase()
    db.prepare('SELECT 1').get()
    res.json({ status: 'ok', checks: { database: 'ok' } })
  } catch (error) {
    res.status(503).json({
      status: 'error',
      checks: { database: 'error' }
    })
  }
})

// ========================================
// STATIC FILE SERVING (SPA)
// ========================================

const clientDistPath = join(__dirname, '../client')
if (existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath))

  // SPA fallback
  app.get('*', (_req, res) => {
    res.sendFile(join(clientDistPath, 'index.html'))
  })
}

// ========================================
// ERROR HANDLING
// ========================================

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Server error:', err)
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    }
  })
})

// ========================================
// START SERVER
// ========================================

const server = createServer(app)

// 初始化 WebSocket
initializeWebSocket(server)

// 设置 WebSocket 服务供 Agent 使用
setWebSocketService(websocketServiceModule)

server.listen(HALO_PORT, HALO_HOST, () => {
  console.log(`Halo server running at http://${HALO_HOST}:${HALO_PORT}`)
  console.log(`Data directory: ${HALO_DATA_DIR} (from ${getDataDirSource()})`)
  console.log(`Auth mode: ${process.env.HALO_AUTH_MODE || 'normal'}`)
  console.log(`WebSocket available at ws://${HALO_HOST}:${HALO_PORT}/ws`)
})

// ========================================
// GRACEFUL SHUTDOWN
// ========================================

const shutdown = () => {
  console.log('\nShutting down gracefully...')
  closeDatabase()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

export { app, server, HALO_DATA_DIR }
