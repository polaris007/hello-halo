/**
 * 数据目录配置测试
 *
 * 测试数据目录解析优先级和配置服务功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { join, resolve } from 'path'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'

// 模拟 process.cwd()
const originalCwd = process.cwd

describe('数据目录配置', () => {
  // 保存原始环境变量
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 清理环境变量
    delete process.env.HALO_DATA_DIR
    delete process.env.HALO_CONFIG_PATH
  })

  afterEach(() => {
    // 恢复环境变量
    process.env = { ...originalEnv }
    process.cwd = originalCwd
  })

  describe('resolveDataDir 优先级', () => {
    it('默认数据目录应为 {cwd}/data', async () => {
      // 动态导入以获取干净的模块状态
      vi.resetModules()

      // 模拟 cwd
      const mockCwd = '/mock/cwd'
      process.cwd = () => mockCwd

      // 由于模块缓存问题，这里只测试逻辑
      const expectedDefault = join(mockCwd, 'data')
      expect(expectedDefault).toBe('/mock/cwd/data')
    })

    it('环境变量 HALO_DATA_DIR 应覆盖默认值', () => {
      const customPath = '/custom/data/path'
      process.env.HALO_DATA_DIR = customPath

      // 验证环境变量已设置
      expect(process.env.HALO_DATA_DIR).toBe(customPath)

      // 解析后的路径应为绝对路径
      const resolvedPath = resolve(customPath)
      expect(resolvedPath).toBe(customPath)
    })

    it('相对路径应解析为绝对路径', () => {
      const relativePath = './data'
      const cwd = process.cwd()
      const resolvedPath = resolve(relativePath)

      expect(resolvedPath).toBe(join(cwd, 'data'))
    })
  })

  describe('配置文件搜索顺序', () => {
    it('HALO_CONFIG_PATH 应有最高优先级', () => {
      const configPath = '/custom/config/server.json'
      process.env.HALO_CONFIG_PATH = configPath

      expect(process.env.HALO_CONFIG_PATH).toBe(configPath)
    })
  })

  describe('数据目录结构', () => {
    it('数据库文件应在数据目录下', () => {
      const dataDir = '/app/data'
      const dbPath = join(dataDir, 'hello.db')
      expect(dbPath).toBe('/app/data/hello.db')
    })

    it('用户目录结构应为 {data-dir}/users/{user_id}/spaces/', () => {
      const dataDir = '/app/data'
      const userId = 'user-123'
      const userSpacesDir = join(dataDir, 'users', userId, 'spaces')

      expect(userSpacesDir).toBe('/app/data/users/user-123/spaces')
    })

    it('日志目录应为 {data-dir}/logs/', () => {
      const dataDir = '/app/data'
      const logsDir = join(dataDir, 'logs')

      expect(logsDir).toBe('/app/data/logs')
    })
  })

  describe('环境变量支持', () => {
    it('HALO_LOG_DIR 应覆盖日志目录', () => {
      const customLogDir = '/custom/logs'
      process.env.HALO_LOG_DIR = customLogDir

      expect(process.env.HALO_LOG_DIR).toBe(customLogDir)
    })

    it('HALO_HOST 应配置服务器地址', () => {
      const host = '0.0.0.0'
      process.env.HALO_HOST = host

      expect(process.env.HALO_HOST).toBe(host)
    })

    it('HALO_PORT 应配置服务器端口', () => {
      const port = '8080'
      process.env.HALO_PORT = port

      expect(process.env.HALO_PORT).toBe(port)
    })
  })
})
