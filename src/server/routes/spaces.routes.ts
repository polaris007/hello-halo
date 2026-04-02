/**
 * 空间管理 API 路由
 */

import { Router } from 'express'
import { getDatabase } from '../utils/database.js'
import { legacyAuthMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware.js'
import { existsSync, mkdirSync, accessSync, statSync, constants, readdirSync, watch } from 'fs'
import { join, resolve, relative } from 'path'
import { randomUUID } from 'crypto'
import { getConfig, resolveDataDir } from '../services/config.service.js'

const router = Router()

// 缓存机制
interface CacheItem {
  data: any
  timestamp: number
}

const artifactCache = new Map<string, CacheItem>()
const MAX_CACHE_ITEMS = 50
const CACHE_TTL = 5 * 60 * 1000 // 5分钟

// 文件系统事件监控
const watchedDirectories = new Map<string, any>()

// 开始监控目录变化
function startWatchingDirectory(spaceId: string, directoryPath: string) {
  // 如果已经在监控，直接返回
  if (watchedDirectories.has(spaceId)) {
    return
  }

  try {
    const watcher = watch(directoryPath, { recursive: true }, (eventType, filename) => {
      // 当目录发生变化时，清除该空间的所有缓存
      clearSpaceCache(spaceId)
    })
    
    watchedDirectories.set(spaceId, watcher)
  } catch (error) {
    // 忽略监控错误
    console.error(`Error watching directory ${directoryPath}:`, error)
  }
}

// 停止监控目录
function stopWatchingDirectory(spaceId: string) {
  const watcher = watchedDirectories.get(spaceId)
  if (watcher) {
    watcher.close()
    watchedDirectories.delete(spaceId)
  }
}

// 清除指定空间的所有缓存
function clearSpaceCache(spaceId: string) {
  for (const key of artifactCache.keys()) {
    if (key.startsWith(`${spaceId}:`)) {
      artifactCache.delete(key)
    }
  }
}

// 清理过期缓存
function cleanupCache() {
  const now = Date.now()
  for (const [key, item] of artifactCache.entries()) {
    if (now - item.timestamp > CACHE_TTL) {
      artifactCache.delete(key)
    }
  }
  
  // 如果缓存项超过最大值，删除最旧的
  if (artifactCache.size > MAX_CACHE_ITEMS) {
    const entries = Array.from(artifactCache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, artifactCache.size - MAX_CACHE_ITEMS)
    toDelete.forEach(([key]) => artifactCache.delete(key))
  }
}

// 获取缓存键
function getCacheKey(spaceId: string, depth: number, showHidden: boolean, filter: string) {
  return `${spaceId}:${depth}:${showHidden}:${filter}`
}

/**
 * Get user ID - use default user if not authenticated
 */
function getUserId(req: any): string {
  if (req.userId) {
    return req.userId
  }
  // Fallback to default user
  const db = getDatabase()
  const defaultUser = db.prepare('SELECT id FROM users WHERE is_default = 1 LIMIT 1').get() as any
  if (defaultUser) {
    return defaultUser.id
  }
  throw new Error('No user found')
}

// 所有空间 API 都需要认证（可选，首次使用时可以不登录）
router.use(optionalAuthMiddleware)

/**
 * GET /api/v1/spaces/hello - 获取 Hello 默认临时空间
 */
router.get('/hello', async (req, res) => {
  try {
    const userId = getUserId(req)
    const config = getConfig()
    const db = getDatabase()

    // Check if hello space already exists
    let helloSpace = db.prepare(`
      SELECT id, name, path, working_dir, created_at, updated_at
      FROM spaces
      WHERE user_id = ? AND name = 'hello'
    `).get(userId) as any

    if (!helloSpace) {
      // Create hello temp space
      const id = randomUUID()
      const dataDir = resolveDataDir()
      const spacePath = join(dataDir, 'users', userId, 'spaces', id)
      if (!existsSync(spacePath)) {
        mkdirSync(spacePath, { recursive: true })
      }
      const now = Date.now()
      db.prepare(`
        INSERT INTO spaces (id, user_id, name, path, working_dir, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, 'hello', spacePath, null, now, now)
      
      helloSpace = {
        id,
        name: 'hello',
        path: spacePath,
        working_dir: null,
        created_at: now,
        updated_at: now
      }
    }

    // Mark as temp space for frontend
    helloSpace.isTemp = true

    res.json({
      success: true,
      data: helloSpace
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/default-path - 获取默认空间路径
 */
router.get('/default-path', (req, res) => {
  try {
    const dataDir = resolveDataDir()
    const defaultPath = join(dataDir, 'spaces')
    res.json({
      success: true,
      data: defaultPath
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces - 获取当前用户的空间列表
 */
router.get('/', (req, res) => {
  try {
    const userId = getUserId(req)
    const db = getDatabase()
    const spaces = db.prepare(`
      SELECT id, name, path, working_dir, created_at, updated_at
      FROM spaces
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId)

    res.json({
      success: true,
      data: spaces
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:id - 获取单个空间
 */
router.get('/:id', (req, res) => {
  try {
    const userId = getUserId(req)
    const db = getDatabase()
    const space = db.prepare(`
      SELECT id, name, path, working_dir, created_at, updated_at
      FROM spaces
      WHERE id = ? AND user_id = ?
    `).get(req.params.id, userId) as any

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    res.json({
      success: true,
      data: space
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/spaces - 创建新空间
 */
router.post('/', (req, res) => {
  try {
    const userId = getUserId(req)
    const { name, customPath } = req.body

    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '空间名称不能为空' }
      })
    }

    // 验证 customPath（如果提供）
    let workingDir: string | null = null
    if (customPath) {
      const resolvedCustomPath = resolve(customPath)

      if (!existsSync(resolvedCustomPath)) {
        // 路径不存在，尝试自动创建
        try {
          mkdirSync(resolvedCustomPath, { recursive: true })
        } catch (mkdirError: any) {
          return res.status(400).json({
            success: false,
            error: { code: 'PATH_CREATE_FAILED', message: `Failed to create directory: ${mkdirError.message}` }
          })
        }
      }

      // 路径已存在或刚创建成功，进行类型和权限检查
      try {
        const stat = statSync(resolvedCustomPath)
        if (!stat.isDirectory()) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_PATH', message: 'The specified custom path is not a directory' }
          })
        }
        accessSync(resolvedCustomPath, constants.R_OK)
      } catch {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_PATH', message: 'No read permission for the specified custom path' }
        })
      }
      workingDir = resolvedCustomPath
    }

    const db = getDatabase()
    const id = randomUUID()
    // 按用户隔离文件系统：{data-dir}/users/{user_id}/spaces/{space_id}/
    const dataDir = resolveDataDir()
    const spacePath = join(dataDir, 'users', userId, 'spaces', id)

    // 确保空间目录存在
    if (!existsSync(spacePath)) {
      mkdirSync(spacePath, { recursive: true })
    }

    db.prepare(`
      INSERT INTO spaces (id, user_id, name, path, working_dir)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, name, spacePath, workingDir)

    res.status(201).json({
      success: true,
      data: {
        id,
        name,
        path: spacePath,
        working_dir: workingDir,
        created_at: Date.now(),
        updated_at: Date.now()
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * PUT /api/v1/spaces/:id - 更新空间
 */
router.put('/:id', (req, res) => {
  try {
    const userId = getUserId(req)
    const { name } = req.body
    const db = getDatabase()

    // 检查空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    db.prepare(`
      UPDATE spaces
      SET name = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(name || (space as any).name, Date.now(), req.params.id, userId)

    res.json({
      success: true,
      data: {
        id: req.params.id,
        name: name || (space as any).name,
        updated_at: Date.now()
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/spaces/:id - 删除空间
 */
router.delete('/:id', (req, res) => {
  try {
    const userId = getUserId(req)
    const db = getDatabase()

    // 检查空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(req.params.id, userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 删除空间（外键约束会自动删除相关的 conversations）
    db.prepare('DELETE FROM spaces WHERE id = ? AND user_id = ?').run(req.params.id, userId)

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:id/artifacts - 列出空间内的工件（文件和文件夹）
 */
router.get('/:id/artifacts', (req, res) => {
  try {
    const userId = getUserId(req)
    const { id } = req.params
    const depth = parseInt(req.query.depth as string) || 5
    const showHidden = req.query.showHidden === 'true'
    const filter = req.query.filter as string || ''

    // 清理过期缓存
    cleanupCache()

    // 检查缓存
    const cacheKey = getCacheKey(id, depth, showHidden, filter)
    const cachedItem = artifactCache.get(cacheKey)
    if (cachedItem) {
      return res.json({
        success: true,
        data: cachedItem.data.artifacts,
        metadata: cachedItem.data.metadata
      })
    }

    // 检查空间是否存在且属于当前用户
    const db = getDatabase()
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(id, userId) as any

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 确定扫描目录
    const scanDir = space.working_dir || space.path

    // 验证目录存在且可访问
    if (!existsSync(scanDir)) {
      return res.status(404).json({
        success: false,
        error: { code: 'PATH_NOT_FOUND', message: '扫描目录不存在' }
      })
    }

    try {
      accessSync(scanDir, constants.R_OK)
    } catch {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: '没有扫描目录的读取权限' }
      })
    }

    // 开始监控目录变化
    startWatchingDirectory(id, scanDir)

    // 递归扫描目录
    const artifacts: any[] = []
    const MAX_FILES = 500
    let fileCount = 0
    let truncated = false

    function scanDirectory(currentPath: string, currentDepth: number) {
      if (currentDepth > depth || fileCount >= MAX_FILES) {
        truncated = true
        return
      }

      try {
        const entries = readdirSync(currentPath, { withFileTypes: true })

        for (const entry of entries) {
          if (fileCount >= MAX_FILES) {
            truncated = true
            break
          }

          // 过滤隐藏文件
          if (!showHidden && entry.name.startsWith('.')) {
            continue
          }

          const fullPath = join(currentPath, entry.name)
          const relativePath = relative(scanDir, fullPath)

          try {
            const stat = statSync(fullPath)
            const artifact: any = {
              id: randomUUID(),
              name: entry.name,
              type: entry.isDirectory() ? 'folder' : 'file',
              path: fullPath,
              relativePath: relativePath.replace(/\\/g, '/'),
              extension: entry.isDirectory() ? '' : entry.name.split('.').pop() || '',
              icon: entry.isDirectory() ? 'folder' : 'file',
              createdAt: stat.birthtime.toISOString(),
              modifiedAt: stat.mtime.toISOString()
            }

            if (!entry.isDirectory()) {
              artifact.size = stat.size
            }

            // 应用过滤
            if (!filter || artifact.name.includes(filter) || artifact.relativePath.includes(filter)) {
              artifacts.push(artifact)
              fileCount++
            }

            // 递归扫描子目录
            if (entry.isDirectory()) {
              scanDirectory(fullPath, currentDepth + 1)
            }
          } catch {
            // 跳过无法访问的文件
            continue
          }
        }
      } catch {
        // 跳过无法读取的目录
        return
      }
    }

    // 开始扫描
    scanDirectory(scanDir, 0)

    // 缓存结果
    const cacheData = {
      artifacts,
      metadata: {
        total: fileCount,
        truncated
      }
    }
    artifactCache.set(cacheKey, {
      data: cacheData,
      timestamp: Date.now()
    })

    res.json({
      success: true,
      data: artifacts,
      metadata: {
        total: fileCount,
        truncated
      }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
