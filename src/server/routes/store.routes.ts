/**
 * 应用商店 API 路由
 * 提供应用商店的查询和安装功能
 */

import { Router, Request, Response } from 'express'
import { legacyAuthMiddleware } from '../middleware/auth.middleware.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const router = Router()

// 所有商店 API 都需要认证
router.use(legacyAuthMiddleware)

/**
 * GET /api/v1/store/apps - 获取商店应用列表
 */
router.get('/apps', async (req: Request, res: Response) => {
  try {
    const { search, locale = 'zh-CN', category, type, tags } = req.query

    // TODO: 实现商店应用列表查询
    // 目前返回空列表

    const apps: any[] = []

    res.json({
      success: true,
      data: apps
    })
  } catch (error: any) {
    console.error('List store apps error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/store/apps/:slug - 获取商店应用详情
 */
router.get('/apps/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params

    // TODO: 实现商店应用详情查询

    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: '应用不存在' }
    })
  } catch (error: any) {
    console.error('Get store app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/store/apps/:slug/install - 安装商店应用
 */
router.post('/apps/:slug/install', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params
    const { spaceId, userConfig } = req.body

    if (!spaceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '空间 ID 不能为空' }
      })
    }

    // TODO: 实现商店应用安装逻辑

    res.status(201).json({
      success: true,
      data: { slug, spaceId, installed: true }
    })
  } catch (error: any) {
    console.error('Install store app error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/store/refresh - 刷新商店缓存
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    // TODO: 实现商店缓存刷新逻辑

    res.json({
      success: true,
      data: { refreshed: true }
    })
  } catch (error: any) {
    console.error('Refresh store error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/store/updates - 检查商店更新
 */
router.get('/updates', async (req: Request, res: Response) => {
  try {
    // TODO: 实现商店更新检查逻辑

    res.json({
      success: true,
      data: { updates: [] }
    })
  } catch (error: any) {
    console.error('Check store updates error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * GET /api/v1/store/registries - 获取注册表列表
 */
router.get('/registries', async (req: Request, res: Response) => {
  try {
    // TODO: 实现注册表列表查询

    res.json({
      success: true,
      data: { registries: [] }
    })
  } catch (error: any) {
    console.error('Get registries error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/store/registries - 添加注册表
 */
router.post('/registries', async (req: Request, res: Response) => {
  try {
    const { name, url } = req.body

    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: '缺少必要参数' }
      })
    }

    // TODO: 实现添加注册表逻辑

    res.status(201).json({
      success: true,
      data: { name, url }
    })
  } catch (error: any) {
    console.error('Add registry error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * DELETE /api/v1/store/registries/:id - 删除注册表
 */
router.delete('/registries/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params

    // TODO: 实现删除注册表逻辑

    res.json({
      success: true,
      data: null
    })
  } catch (error: any) {
    console.error('Delete registry error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

/**
 * POST /api/v1/store/registries/:id/toggle - 切换注册表状态
 */
router.post('/registries/:id/toggle', async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { enabled } = req.body

    // TODO: 实现切换注册表状态逻辑

    res.json({
      success: true,
      data: { id, enabled }
    })
  } catch (error: any) {
    console.error('Toggle registry error:', error)
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: error.message }
    })
  }
})

export { router }
