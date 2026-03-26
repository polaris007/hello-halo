/**
 * 文件上传下载 API 路由
 */

import { Router, Request, Response } from 'express'
import { getDatabase } from '../utils/database'
import { authMiddleware } from '../middleware/auth.middleware'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'fs'
import { join, basename, isAbsolute, resolve, sep, extname } from 'path'
import multer from 'multer'
import { resolveDataDir } from '../services/config.service'

/**
 * 验证路径是否在空间目录边界内，防止路径遍历攻击
 * @param spacePath 空间目录的绝对路径
 * @param targetPath 目标路径（可以是相对路径或绝对路径）
 * @returns 如果目标路径在空间目录内返回 true，否则返回 false
 */
export function validatePathBoundary(spacePath: string, targetPath: string): boolean {
  const resolvedSpacePath = resolve(spacePath)
  const resolvedTargetPath = resolve(spacePath, targetPath)
  return resolvedTargetPath.startsWith(resolvedSpacePath + sep) ||
         resolvedTargetPath === resolvedSpacePath
}

/**
 * MIME 类型映射
 */
const MIME_TYPES: Record<string, string> = {
  // 文本
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  // 代码
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript-jsx',
  '.jsx': 'text/jsx',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.less': 'text/x-less',
  '.py': 'text/x-python',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.rs': 'text/x-rust',
  '.go': 'text/x-go',
  '.rb': 'text/x-ruby',
  '.php': 'text/x-php',
  '.swift': 'text/x-swift',
  '.kt': 'text/x-kotlin',
  '.scala': 'text/x-scala',
  '.r': 'text/x-r',
  '.lua': 'text/x-lua',
  '.pl': 'text/x-perl',
  '.sh': 'text/x-sh',
  '.bash': 'text/x-sh',
  '.zsh': 'text/x-zsh',
  '.ps1': 'text/x-powershell',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/x-toml',
  '.ini': 'text/x-ini',
  '.xml': 'text/xml',
  '.sql': 'text/x-sql',
  '.vue': 'text/x-vue',
  '.svelte': 'text/x-svelte',
  // 图片
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  // 二进制
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.exe': 'application/x-msdownload',
  '.dll': 'application/x-msdownload',
  '.so': 'application/x-sharedlib',
  '.dylib': 'application/x-sharedlib',
  // 音视频
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  // 字体
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  // 文档
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

/**
 * 语言映射（用于代码高亮）
 */
const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
  '.json': 'json',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.rs': 'rust',
  '.go': 'go',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.lua': 'lua',
  '.pl': 'perl',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.ps1': 'powershell',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.ini': 'ini',
  '.xml': 'xml',
  '.sql': 'sql',
  '.md': 'markdown',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.txt': 'text'
}

/**
 * 二进制文件扩展名
 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.mp3', '.wav', '.ogg', '.flac',
  '.mp4', '.webm', '.avi', '.mov', '.mkv',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.bin', '.dat'
])

/**
 * 最大文件大小限制（2MB）
 */
const MAX_FILE_SIZE = 2 * 1024 * 1024

/**
 * 检测文件的 MIME 类型
 */
function detectMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

/**
 * 检测文件的语言（用于代码高亮）
 */
function detectLanguage(filePath: string): string | undefined {
  const ext = extname(filePath).toLowerCase()
  return LANGUAGE_MAP[ext]
}

/**
 * 检测文件是否为二进制
 */
function isBinaryFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}

/**
 * 检测文件类型分类
 */
function detectFileType(filePath: string): 'code' | 'markdown' | 'image' | 'json' | 'text' | 'binary' | 'unknown' {
  const ext = extname(filePath).toLowerCase()

  if (BINARY_EXTENSIONS.has(ext)) {
    if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'].includes(ext)) {
      return 'image'
    }
    return 'binary'
  }

  if (ext === '.md') return 'markdown'
  if (ext === '.json') return 'json'
  if (LANGUAGE_MAP[ext]) return 'code'
  if (ext === '.txt' || ext === '.csv') return 'text'

  return 'unknown'
}

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
 * Multer 错误处理中间件
 * 处理文件大小超出限制等错误，返回正确的 HTTP 状态码
 */
function handleMulterError(err: any, _req: Request, res: Response, next: any) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: '文件大小超过 100MB 限制' }
    })
  }
  if (err) {
    return res.status(400).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: err.message }
    })
  }
  next()
}

/**
 * POST /api/v1/spaces/:spaceId/files - 上传文件
 */
router.post('/spaces/:spaceId/files', upload.single('file'), handleMulterError, (req: Request, res: Response) => {
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
    let spacePath = (space as any).path
    // 检查是否为绝对路径，如果不是则相对于数据目录解析
    if (!isAbsolute(spacePath)) {
      spacePath = join(resolveDataDir(), spacePath)
    }

    // 安全验证：确保路径在空间目录内
    const targetRelativePath = join(subPath, fileName)
    if (!validatePathBoundary(spacePath, targetRelativePath)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Access denied: path outside space directory' }
      })
    }

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
 * GET /api/v1/spaces/:spaceId/files/:path/content - 获取文件内容
 * 返回文件的文本内容及相关元数据，用于前端内容展示
 * 注意：此路由必须在 regex 路由之前定义，确保正确匹配
 */
router.get('/spaces/:spaceId/files/:path/content', (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params
    const filePath = req.params.path

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
    let spacePath = (space as any).path
    if (!isAbsolute(spacePath)) {
      spacePath = join(resolveDataDir(), spacePath)
    }

    // 安全验证：确保路径在空间目录内
    if (!validatePathBoundary(spacePath, filePath)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Access denied: path outside space directory' }
      })
    }

    const fullPath = join(spacePath, filePath)

    // 检查文件是否存在
    if (!existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: '文件不存在' }
      })
    }

    // 获取文件信息
    const stats = statSync(fullPath)

    // 检查文件大小
    if (stats.size > MAX_FILE_SIZE) {
      return res.status(413).json({
        success: false,
        error: { code: 'FILE_TOO_LARGE', message: '文件过大，无法预览（最大 2MB）' }
      })
    }

    // 检测文件类型
    const mimeType = detectMimeType(filePath)
    const isBinary = isBinaryFile(filePath)

    // 二进制文件返回元数据但不返回内容
    if (isBinary) {
      return res.json({
        success: true,
        data: {
          path: filePath,
          mimeType,
          size: stats.size,
          isBinary: true
        }
      })
    }

    // 读取文本文件内容
    const content = readFileSync(fullPath, 'utf-8')
    const language = detectLanguage(filePath)

    res.json({
      success: true,
      data: {
        content,
        path: filePath,
        mimeType,
        size: stats.size,
        language,
        isBinary: false
      }
    })
  } catch (error: any) {
    console.error('File content read error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'READ_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/spaces/:spaceId/files/:path/detect-type - 检测文件类型
 * 返回文件类型信息，不返回文件内容
 * 注意：此路由必须在 regex 路由之前定义，确保正确匹配
 */
router.get('/spaces/:spaceId/files/:path/detect-type', (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params
    const filePath = req.params.path

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
    let spacePath = (space as any).path
    if (!isAbsolute(spacePath)) {
      spacePath = join(resolveDataDir(), spacePath)
    }

    // 安全验证：确保路径在空间目录内
    if (!validatePathBoundary(spacePath, filePath)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Access denied: path outside space directory' }
      })
    }

    const fullPath = join(spacePath, filePath)

    // 检查文件是否存在
    if (!existsSync(fullPath)) {
      return res.status(404).json({
        success: false,
        error: { code: 'FILE_NOT_FOUND', message: '文件不存在' }
      })
    }

    // 检测文件类型
    const type = detectFileType(filePath)
    const mimeType = detectMimeType(filePath)
    const language = detectLanguage(filePath)

    res.json({
      success: true,
      data: {
        type,
        mimeType,
        language
      }
    })
  } catch (error: any) {
    console.error('File type detection error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'DETECT_ERROR', message: error.message }
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
    let spacePath = (space as any).path
    // 检查是否为绝对路径，如果不是则相对于数据目录解析
    if (!isAbsolute(spacePath)) {
      spacePath = join(resolveDataDir(), spacePath)
    }

    // 安全验证：确保路径在空间目录内
    if (!validatePathBoundary(spacePath, filePath)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Access denied: path outside space directory' }
      })
    }

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
    let spacePath = (space as any).path
    // 检查是否为绝对路径，如果不是则相对于数据目录解析
    if (!isAbsolute(spacePath)) {
      spacePath = join(resolveDataDir(), spacePath)
    }

    // 安全验证：确保路径在空间目录内
    if (!validatePathBoundary(spacePath, dirPath)) {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCESS_DENIED', message: 'Access denied: path outside space directory' }
      })
    }

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
