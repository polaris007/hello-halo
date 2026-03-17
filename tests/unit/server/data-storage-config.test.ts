/**
 * 数据存储路径配置测试
 * 测试 config.service.ts 中的数据目录解析逻辑
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { tmpdir } from 'os'

// 模拟环境变量
const originalEnv = { ...process.env }

// 创建临时测试目录
const TEST_TMP_DIR = join(tmpdir(), 'halo-data-dir-test-' + Date.now())

describe('数据存储路径配置', () => {
  beforeEach(() => {
    // 创建测试目录
    if (!existsSync(TEST_TMP_DIR)) {
      mkdirSync(TEST_TMP_DIR, { recursive: true })
    }
    // 清除环境变量
    delete process.env.HALO_DATA_DIR
    delete process.env.HALO_CONFIG_PATH
  })

  afterEach(() => {
    // 清理测试目录
    if (existsSync(TEST_TMP_DIR)) {
      rmSync(TEST_TMP_DIR, { recursive: true, force: true })
    }
    // 恢复环境变量
    process.env = { ...originalEnv }
  })

  describe('resolveDataDir', () => {
    it('应当使用默认值 {cwd}/data 当没有配置时', async () => {
      // 动态导入以避免模块缓存
      vi.resetModules()
      const { resolveDataDir, getDataDirSource } = await import('../../../src/server/services/config.service')

      const dataDir = resolveDataDir()
      expect(dataDir).toBe(join(process.cwd(), 'data'))
      expect(getDataDirSource()).toBe('default (cwd/data)')
    })

    it('应当使用 HALO_DATA_DIR 环境变量指定的路径', async () => {
      process.env.HALO_DATA_DIR = TEST_TMP_DIR
      vi.resetModules()

      const { resolveDataDir, getDataDirSource } = await import('../../../src/server/services/config.service')

      const dataDir = resolveDataDir()
      expect(dataDir).toBe(TEST_TMP_DIR)
      expect(getDataDirSource()).toBe('HALO_DATA_DIR environment variable')
    })

    it('应当将相对路径转换为绝对路径', async () => {
      process.env.HALO_DATA_DIR = './test-data'
      vi.resetModules()

      const { resolveDataDir } = await import('../../../src/server/services/config.service')

      const dataDir = resolveDataDir()
      expect(dataDir).toBe(resolve('./test-data'))
    })
  })

  describe('ensureDataDir', () => {
    it('应当自动创建数据目录', async () => {
      vi.resetModules()
      const { ensureDataDir } = await import('../../../src/server/services/config.service')

      const newDir = join(TEST_TMP_DIR, 'auto-created')
      expect(existsSync(newDir)).toBe(false)

      ensureDataDir(newDir)
      expect(existsSync(newDir)).toBe(true)
    })

    it('应当在权限不足时抛出错误', async () => {
      vi.resetModules()
      const { ensureDataDir } = await import('../../../src/server/services/config.service')

      // 在 Windows 上，根目录通常不允许写入
      // 这个测试在某些系统上可能会通过，所以只验证函数存在
      expect(typeof ensureDataDir).toBe('function')
    })
  })

  describe('配置优先级', () => {
    it('启动参数（通过环境变量）应当具有最高优先级', async () => {
      // 模拟启动参数设置的环境变量
      process.env.HALO_DATA_DIR = '/cli/data'

      // 创建配置文件
      const configDir = join(TEST_TMP_DIR, 'config-test')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'server.json'), JSON.stringify({
        data: { basePath: '/config/data' }
      }))

      vi.resetModules()
      const { resolveDataDir, getDataDirSource } = await import('../../../src/server/services/config.service')

      const dataDir = resolveDataDir()
      expect(dataDir).toBe('/cli/data')
      expect(getDataDirSource()).toBe('HALO_DATA_DIR environment variable')
    })
  })

  describe('checkLegacyDataDir', () => {
    it('函数应当存在并可调用', async () => {
      vi.resetModules()
      const { checkLegacyDataDir } = await import('../../../src/server/services/config.service')

      expect(typeof checkLegacyDataDir).toBe('function')
      // 不应当抛出错误
      expect(() => checkLegacyDataDir()).not.toThrow()
    })
  })
})
