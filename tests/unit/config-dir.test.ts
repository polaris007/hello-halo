/**
 * 配置目录服务单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

// 测试用的临时目录
const TEST_DIR = join(process.cwd(), 'test-config-dir-temp')

describe('config-dir.service', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // 重置环境变量
    process.env = { ...originalEnv }
    delete process.env.HALO_CONFIG_DIR
    delete process.env.HALO_CONFIG_PATH

    // 清理缓存
    vi.resetModules()

    // 创建测试目录
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true })
    }
  })

  afterEach(() => {
    // 恢复环境变量
    process.env = originalEnv

    // 清理测试目录
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('resolveConfigDir', () => {
    it('应返回默认配置目录（cwd/config）', async () => {
      const { resolveConfigDir, getConfigDirSource } = await import('../../src/server/services/config-dir.service.js')
      const dir = resolveConfigDir()
      expect(dir).toBe(join(process.cwd(), 'config'))
      expect(getConfigDirSource()).toBe('default (cwd/config)')
    })

    it('应返回环境变量指定的目录', async () => {
      const customDir = resolve('/custom/config')
      process.env.HALO_CONFIG_DIR = customDir
      const { resolveConfigDir, getConfigDirSource } = await import('../../src/server/services/config-dir.service.js')
      const dir = resolveConfigDir()
      expect(dir).toBe(customDir)
      expect(getConfigDirSource()).toBe('HALO_CONFIG_DIR environment variable')
    })
  })

  describe('buildConfigSearchPaths', () => {
    it('应构建正确的搜索路径列表', async () => {
      const { buildConfigSearchPaths } = await import('../../src/server/services/config-dir.service.js')
      const paths = buildConfigSearchPaths('server.json')

      // 应包含配置目录路径
      const hasConfigPath = paths.some(p => p.includes('config') && p.endsWith('server.json'))
      expect(hasConfigPath).toBe(true)

      // 应包含 cwd 路径
      const hasCwdPath = paths.some(p => p.endsWith('server.json'))
      expect(hasCwdPath).toBe(true)
    })

    it('应在 HALO_CONFIG_PATH 设置时包含该路径', async () => {
      const customPath = resolve('/custom/server.json')
      process.env.HALO_CONFIG_PATH = customPath
      const { buildConfigSearchPaths } = await import('../../src/server/services/config-dir.service.js')
      const paths = buildConfigSearchPaths('server.json')

      expect(paths).toContain(customPath)
    })
  })

  describe('findConfigFile', () => {
    it('应在配置目录找到存在的文件', async () => {
      const configDir = join(TEST_DIR, 'config')
      mkdirSync(configDir, { recursive: true })
      const testFilePath = join(configDir, 'test-config.json')
      writeFileSync(testFilePath, '{}')

      process.env.HALO_CONFIG_DIR = configDir
      const { findConfigFile } = await import('../../src/server/services/config-dir.service.js')
      const result = findConfigFile('test-config.json')

      expect(result).not.toBeNull()
      expect(result?.path).toBe(testFilePath)
      expect(result?.isLegacy).toBe(false)
    })

    it('应返回 null 当文件不存在时', async () => {
      const configDir = join(TEST_DIR, 'empty-config')
      mkdirSync(configDir, { recursive: true })
      process.env.HALO_CONFIG_DIR = configDir

      const { findConfigFile } = await import('../../src/server/services/config-dir.service.js')
      const result = findConfigFile('nonexistent-file.json')

      expect(result).toBeNull()
    })
  })

  describe('detectLegacyConfig', () => {
    it('应正确返回检测结果', async () => {
      // 设置一个自定义的 config 目录
      const configDir = join(TEST_DIR, 'test-config-dir')
      mkdirSync(configDir, { recursive: true })
      process.env.HALO_CONFIG_DIR = configDir

      const { detectLegacyConfig } = await import('../../src/server/services/config-dir.service.js')
      const result = detectLegacyConfig()

      // 验证返回结构正确
      expect(result).toHaveProperty('serverJson')
      expect(result).toHaveProperty('llmConfigJson')
      expect(result).toHaveProperty('legacyPath')
      expect(typeof result.serverJson).toBe('boolean')
      expect(typeof result.llmConfigJson).toBe('boolean')
    })
  })
})
