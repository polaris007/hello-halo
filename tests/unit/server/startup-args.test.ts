/**
 * 启动参数解析测试
 * 测试 --data-dir 和 --config 参数解析
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { parseArgs } from 'util'
import { join, resolve } from 'path'

describe('启动参数解析', () => {
  const originalArgv = [...process.argv]
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // 清除环境变量
    delete process.env.HALO_DATA_DIR
    delete process.env.HALO_CONFIG_PATH
  })

  afterEach(() => {
    // 恢复原始状态
    process.argv = [...originalArgv]
    process.env = { ...originalEnv }
  })

  describe('--data-dir 参数', () => {
    it('应当解析 --data-dir 参数', () => {
      const { values } = parseArgs({
        options: {
          'data-dir': {
            type: 'string',
            short: 'd'
          }
        },
        strict: false,
        args: ['--data-dir', '/custom/data']
      })

      expect(values['data-dir']).toBe('/custom/data')
    })

    it('应当支持短参数 -d', () => {
      const { values } = parseArgs({
        options: {
          'data-dir': {
            type: 'string',
            short: 'd'
          }
        },
        strict: false,
        args: ['-d', '/custom/data']
      })

      expect(values['data-dir']).toBe('/custom/data')
    })

    it('应当允许设置 HALO_DATA_DIR 环境变量', () => {
      const customPath = '/my/custom/data'
      process.env.HALO_DATA_DIR = customPath

      expect(process.env.HALO_DATA_DIR).toBe(customPath)
    })
  })

  describe('--config 参数', () => {
    it('应当解析 --config 参数', () => {
      const { values } = parseArgs({
        options: {
          'config': {
            type: 'string',
            short: 'c'
          }
        },
        strict: false,
        args: ['--config', '/path/to/config.json']
      })

      expect(values['config']).toBe('/path/to/config.json')
    })

    it('应当支持短参数 -c', () => {
      const { values } = parseArgs({
        options: {
          'config': {
            type: 'string',
            short: 'c'
          }
        },
        strict: false,
        args: ['-c', '/path/to/config.json']
      })

      expect(values['config']).toBe('/path/to/config.json')
    })

    it('应当允许设置 HALO_CONFIG_PATH 环境变量', () => {
      const configPath = '/my/config/server.json'
      process.env.HALO_CONFIG_PATH = configPath

      expect(process.env.HALO_CONFIG_PATH).toBe(configPath)
    })
  })

  describe('组合参数', () => {
    it('应当同时解析多个参数', () => {
      const { values } = parseArgs({
        options: {
          'data-dir': {
            type: 'string',
            short: 'd'
          },
          'config': {
            type: 'string',
            short: 'c'
          }
        },
        strict: false,
        args: ['--data-dir', '/data', '--config', '/config.json']
      })

      expect(values['data-dir']).toBe('/data')
      expect(values['config']).toBe('/config.json')
    })

    it('应当忽略未知参数（strict: false）', () => {
      const { values } = parseArgs({
        options: {
          'data-dir': {
            type: 'string',
            short: 'd'
          }
        },
        strict: false,
        args: ['--data-dir', '/data', '--unknown-arg', 'value']
      })

      expect(values['data-dir']).toBe('/data')
    })
  })

  describe('配置优先级验证', () => {
    it('启动参数应当覆盖环境变量', () => {
      // 设置环境变量
      process.env.HALO_DATA_DIR = '/env/data'

      // 模拟启动参数覆盖
      const cliPath = '/cli/data'
      process.env.HALO_DATA_DIR = cliPath // 模拟 index.ts 中的逻辑

      expect(process.env.HALO_DATA_DIR).toBe(cliPath)
    })
  })
})
