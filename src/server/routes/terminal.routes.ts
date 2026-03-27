/**
 * Terminal API Routes
 * Provides secure command execution on the server
 */

import { Router, Request, Response } from 'express'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join, isAbsolute } from 'path'
import { authMiddleware } from '../middleware/auth.middleware.js'
import { getDatabase } from '../utils/database.js'
import { resolveDataDir } from '../services/config.service.js'

const router = Router()
const execAsync = promisify(exec)

// All terminal APIs require authentication
router.use(authMiddleware)

// Allowed commands whitelist
const ALLOWED_COMMANDS = [
  'git',
  'npm',
  'node',
  'npx',
  'yarn',
  'pnpm',
  'python',
  'python3',
  'pip',
  'ls',
  'dir',
  'cat',
  'type',
  'echo',
  'mkdir',
  'cd',
  'pwd',
  'cp',
  'copy',
  'mv',
  'move',
  'rm',
  'del',
  'find',
  'grep',
  'curl',
  'wget',
  'tar',
  'zip',
  'unzip'
]

// Command timeout (30 seconds)
const COMMAND_TIMEOUT = 30000

/**
 * POST /api/v1/terminal/execute - Execute a command
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { spaceId, command, args = [], workingDir } = req.body

    if (!command) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Command is required' }
      })
    }

    // Validate command is in whitelist
    const baseCommand = command.split(' ')[0].toLowerCase()
    if (!ALLOWED_COMMANDS.includes(baseCommand)) {
      return res.status(403).json({
        success: false,
        error: { code: 'COMMAND_NOT_ALLOWED', message: `Command '${baseCommand}' is not allowed` }
      })
    }

    // If spaceId provided, verify space belongs to user
    let targetDir = workingDir
    if (spaceId) {
      const db = getDatabase()
      const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(spaceId, req.userId) as any
      if (!space) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Space not found' }
        })
      }

      // Resolve working directory with proper path handling
      // Priority: workingDir param > space.working_dir > space.path
      if (!targetDir) {
        if (space.working_dir) {
          targetDir = space.working_dir
        } else if (space.path) {
          // Handle relative paths: resolve against data directory
          targetDir = isAbsolute(space.path)
            ? space.path
            : join(resolveDataDir(), space.path)
        }
      }
    }

    // Build full command
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command

    // Execute command with timeout
    const { stdout, stderr } = await execAsync(fullCommand, {
      cwd: targetDir,
      timeout: COMMAND_TIMEOUT,
      maxBuffer: 1024 * 1024 // 1MB output limit
    })

    res.json({
      success: true,
      data: {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: fullCommand,
        executedAt: new Date().toISOString()
      }
    })
  } catch (error: any) {
    console.error('Terminal execution error:', error)

    // Handle timeout error
    if (error.killed && error.signal === 'SIGTERM') {
      return res.status(408).json({
        success: false,
        error: { code: 'TIMEOUT', message: 'Command execution timed out' }
      })
    }

    // Handle other errors
    res.status(500).json({
      success: false,
      error: {
        code: 'EXECUTION_ERROR',
        message: error.message,
        stderr: error.stderr?.trim() || null
      }
    })
  }
})

/**
 * GET /api/v1/terminal/allowed-commands - Get list of allowed commands
 */
router.get('/allowed-commands', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      commands: ALLOWED_COMMANDS,
      timeout: COMMAND_TIMEOUT
    }
  })
})

export { router }
