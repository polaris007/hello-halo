/**
 * Halo - Web Server Entry Point
 * The main entry point for the B/S architecture web server
 */

import express from 'express'
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
// EXPRESS APP SETUP
// ========================================

const app = express()

// Trust proxy (for reverse proxy deployments)
app.set('trust proxy', 1)

// Body parsers
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// ========================================
// HEALTH CHECK ENDPOINTS
// ========================================

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/ready', async (_req, res) => {
  // TODO: Check database connection
  res.json({ status: 'ok', checks: { database: 'ok' } })
})

// ========================================
// API ROUTES
// ========================================

// TODO: Import and use routes
// app.use('/api/v1', apiRoutes)

// ========================================
// STATIC FILE SERVING (SPA)
// ========================================

// TODO: Serve static files from dist/client

// SPA fallback - all non-API routes should serve index.html
// app.get('*', (_req, res) => {
//   res.sendFile(join(__dirname, '../client/index.html'))
// })

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

server.listen(HALO_PORT, HALO_HOST, () => {
  console.log(`Halo server running at http://${HALO_HOST}:${HALO_PORT}`)
  console.log(`Data directory: ${HALO_DATA_DIR}`)
})

// ========================================
// GRACEFUL SHUTDOWN
// ========================================

const shutdown = () => {
  console.log('\nShutting down gracefully...')
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
