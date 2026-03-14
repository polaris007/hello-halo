/**
 * Halo - Web Server Entry Point
 * The main entry point for the B/S architecture web server
 */

import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'

// ========================================
// CONFIGURATION
// ========================================

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Data directory
const HALO_DATA_DIR = process.env.HALO_DATA_DIR || join(homedir(), '.halo')
const HALO_PORT = parseInt(process.env.HALO_PORT || '3000', 10)
const HALO_HOST = process.env.HALO_HOST || '127.0.0.1'

// Ensure data directory exists
if (!existsSync(HALO_DATA_DIR)) {
  mkdirSync(HALO_DATA_DIR, { recursive: true })
}

// ========================================
// DATABASE INITIALIZATION
// ========================================

import { initializeDatabase, runMigrations, getDatabase, closeDatabase } from './utils/database'
import { initializeDefaultUser, cleanupExpiredSessions } from './services/auth.service'
import { loadAuthConfig } from './middleware/auth.middleware'
import { loadConfig, applyEnvOverrides, getConfig } from './services/config.service'

// Load configuration
loadConfig()
applyEnvOverrides()

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

// ========================================
// API ROUTES
// ========================================

import { router as authRoutes } from './routes/auth.routes'
import { router as spacesRoutes } from './routes/spaces.routes'
import { router as configsRoutes } from './routes/configs.routes'
import { router as filesRoutes } from './routes/files.routes'
import { router as aiSourcesRoutes } from './routes/ai-sources.routes'
import { router as agentRoutes } from './routes/agent.routes'
import { router as appsRoutes } from './routes/apps.routes'
import { router as storeRoutes } from './routes/store.routes'
import { router as searchRoutes } from './routes/search.routes'
import { router as notifyChannelsRoutes } from './routes/notify-channels.routes'
import { router as systemRoutes } from './routes/system.routes'
import { router as filesystemRoutes } from './routes/filesystem.routes'
import { initializeWebSocket } from './services/websocket.service'

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/spaces', spacesRoutes)
app.use('/api/v1/configs', configsRoutes)
app.use('/api/v1/ai-sources', aiSourcesRoutes)
app.use('/api/v1/agent', agentRoutes)
app.use('/api/v1/apps', appsRoutes)
app.use('/api/v1/store', storeRoutes)
app.use('/api/v1/search', searchRoutes)
app.use('/api/v1/notify-channels', notifyChannelsRoutes)
app.use('/api/v1/system', systemRoutes)
app.use('/api/v1/filesystem', filesystemRoutes)
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

server.listen(HALO_PORT, HALO_HOST, () => {
  console.log(`Halo server running at http://${HALO_HOST}:${HALO_PORT}`)
  console.log(`Data directory: ${HALO_DATA_DIR}`)
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
