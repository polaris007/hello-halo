/**
 * 文件系统浏览 API 路由
 * 提供服务端目录浏览能力，支持 Windows/Linux/Mac 跨平台
 */

import { Router, Request, Response } from 'express'
import { readdirSync, existsSync, accessSync, statSync, mkdirSync, constants } from 'fs'
import { resolve, sep, dirname, parse as pathParse } from 'path'
import { homedir, platform } from 'os'
import { execSync } from 'child_process'
import { authMiddleware } from '../middleware/auth.middleware.js'

const router = Router()

// 所有文件系统 API 都需要认证
router.use(authMiddleware)

/**
 * GET /api/v1/filesystem/roots - 获取文件系统根路径列表
 */
router.get('/roots', (_req: Request, res: Response) => {
  try {
    const roots: Array<{ path: string; name: string }> = []

    if (platform() === 'win32') {
      // Windows: 获取可用盘符
      try {
        const output = execSync('wmic logicaldisk get name', { encoding: 'utf-8' })
        const drives = output
          .split('\n')
          .map(line => line.trim())
          .filter(line => /^[A-Z]:$/.test(line))
          .map(drive => drive + '\\')

        for (const drive of drives) {
          roots.push({ path: drive, name: drive })
        }
      } catch {
        // wmic 失败时，遍历字母检测可用盘符
        for (let i = 65; i <= 90; i++) {
          const drive = String.fromCharCode(i) + ':\\'
          if (existsSync(drive)) {
            roots.push({ path: drive, name: drive })
          }
        }
      }
    } else {
      // Linux/Mac: 根目录
      roots.push({ path: '/', name: '/' })
    }

    // 添加用户主目录作为快捷入口
    const home = homedir()
    if (existsSync(home)) {
      roots.push({ path: home, name: 'Home' })
    }

    res.json({
      success: true,
      data: roots
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/filesystem/browse - 浏览指定路径下的子目录
 * Query params:
 *   path: string - 要浏览的路径
 *   showHidden: boolean - 是否显示隐藏目录（默认 false）
 */
router.get('/browse', (req: Request, res: Response) => {
  try {
    const targetPath = req.query.path as string
    const showHidden = req.query.showHidden === 'true'

    if (!targetPath) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PATH', message: 'path parameter is required' }
      })
    }

    // 路径规范化
    const resolvedPath = resolve(targetPath)

    // 存在性检查
    if (!existsSync(resolvedPath)) {
      return res.status(400).json({
        success: false,
        error: { code: 'PATH_NOT_FOUND', message: 'The specified path does not exist' }
      })
    }

    // 目录类型检查
    const stat = statSync(resolvedPath)
    if (!stat.isDirectory()) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_A_DIRECTORY', message: 'The specified path is not a directory' }
      })
    }

    // 权限检查
    try {
      accessSync(resolvedPath, constants.R_OK)
    } catch {
      return res.status(403).json({
        success: false,
        error: { code: 'PERMISSION_DENIED', message: 'No read permission for the specified path' }
      })
    }

    // 读取子目录
    const MAX_ITEMS = 500
    const entries = readdirSync(resolvedPath, { withFileTypes: true })
    const dirs: Array<{ name: string; path: string }> = []
    let truncated = false

    for (const entry of entries) {
      // 过滤隐藏目录
      if (!showHidden && entry.name.startsWith('.')) {
        continue
      }

      // 只返回目录
      let isDir = false
      try {
        if (entry.isDirectory()) {
          isDir = true
        } else if (entry.isSymbolicLink()) {
          // 检查符号链接是否指向目录
          const linkStat = statSync(resolve(resolvedPath, entry.name))
          isDir = linkStat.isDirectory()
        }
      } catch {
        // 无法读取的条目跳过
        continue
      }

      if (isDir) {
        if (dirs.length >= MAX_ITEMS) {
          truncated = true
          break
        }
        dirs.push({
          name: entry.name,
          path: resolve(resolvedPath, entry.name)
        })
      }
    }

    // 按名称排序（不区分大小写）
    dirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

    res.json({
      success: true,
      data: {
        path: resolvedPath,
        separator: sep,
        dirs,
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

/**
 * POST /api/v1/filesystem/mkdir - 创建目录
 * Body params:
 *   path: string - 要创建的目录路径
 */
router.post('/mkdir', (req: Request, res: Response) => {
  try {
    const targetPath = req.body.path as string

    if (!targetPath) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_PATH', message: 'path parameter is required' }
      })
    }

    // 路径规范化
    const resolvedPath = resolve(targetPath)

    // 检查目录是否已存在
    if (existsSync(resolvedPath)) {
      return res.status(400).json({
        success: false,
        error: { code: 'DIR_ALREADY_EXISTS', message: 'The specified directory already exists' }
      })
    }

    // 检查父目录写入权限
    const parentDir = dirname(resolvedPath)
    if (existsSync(parentDir)) {
      try {
        accessSync(parentDir, constants.W_OK)
      } catch {
        return res.status(403).json({
          success: false,
          error: { code: 'PERMISSION_DENIED', message: 'No write permission for the parent directory' }
        })
      }
    }

    // 创建目录（包括中间目录）
    mkdirSync(resolvedPath, { recursive: true })

    res.status(201).json({
      success: true,
      data: { path: resolvedPath }
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
