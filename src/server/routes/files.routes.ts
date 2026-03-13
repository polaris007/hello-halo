/**
 * 文件上传下载 API 路由
 */

import { Router, Request, Response } from 'express'
import { getDatabase } from '../utils/database'
import { authMiddleware } from '../middleware/auth.middleware'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import multer from 'multer'

const router = Router()

// 所有文件 API 都需要认证
router.use(authMiddleware)

// 配置文件上传（内存存储）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
})

/**
 * POST /api/v1/spaces/:spaceId/files - 上传文件
 */
router.post('/spaces/:spaceId/files', upload.single('file'), (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params
    const file = req.file

    if (!file) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '没有上传文件' }
      })
    }

    const db = getDatabase()

    // 验证空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(spaceId, req.userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 获取上传的子路径（如果有）
    const subPath = req.query.path as string || ''
    const fileName = req.query.filename as string || file.originalname

    // 构建文件路径
    const spacePath = (space as any).path
    const filePath = join(spacePath, subPath, fileName)

    // 确保目录存在
    const dir = join(spacePath, subPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    // 写入文件
    writeFileSync(filePath, file.buffer)

    // 获取文件信息
    const stats = statSync(filePath)

    res.status(201).json({
      success: true,
      data: {
        name: fileName,
        path: join(subPath, fileName),
        size: stats.size,
        mimeType: file.mimetype,
        uploadedAt: new Date().toISOString()
      }
    })
  } catch (error: any) {
    console.error('File upload error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:spaceId/files/* - 下载文件
 * Using a regex-based approach for Express 5 compatibility
 */
router.get(/^\/spaces\/([^\/]+)\/files\/(.+)$/, (req: Request, res: Response) => {
  try {
    const spaceId = req.params[0]
    const filePath = req.params[1]

    const db = getDatabase()

    // 验证空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(spaceId, req.userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 构建完整文件路径
    const spacePath = (space as any).path
    const fullPath = join(spacePath, filePath)

    // 检查文件是否存在
    if (!existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: '文件不存在' }
      })
    }

    // 读取文件并返回
    const fileContent = readFileSync(fullPath)
    const fileName = basename(fullPath)

    // 设置响应头
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    res.setHeader('Content-Length', fileContent.length)
    res.send(fileContent)
  } catch (error: any) {
    console.error('File download error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'DOWNLOAD_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:spaceId/files - 列出文件
 */
router.get('/spaces/:spaceId/files', (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params
    const dirPath = req.query.path as string || ''

    const db = getDatabase()

    // 验证空间是否存在且属于当前用户
    const space = db.prepare('SELECT * FROM spaces WHERE id = ? AND user_id = ?').get(spaceId, req.userId)

    if (!space) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: '空间不存在' }
      })
    }

    // 构建目录路径
    const spacePath = (space as any).path
    const fullPath = join(spacePath, dirPath)

    // 检查目录是否存在
    if (!existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'DIR_NOT_FOUND', message: '目录不存在' }
      })
    }

    // 读取目录内容
    const entries = readdirSync(fullPath, { withFileTypes: true })
    const files = entries.map((entry) => {
      const entryPath = join(fullPath, entry.name)
      const stats = statSync(entryPath)
      return {
        name: entry.name,
        path: join(dirPath, entry.name),
        isDirectory: entry.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime.toISOString()
      }
    })

    res.json({
      success: true,
      data: {
        path: dirPath,
        files
      }
    })
  } catch (error: any) {
    console.error('File list error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: error.message }
    })
  }
})

export { router }
