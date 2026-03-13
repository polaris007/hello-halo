/**
 * 数据库工具类
 * 基于 better-sqlite3 的数据库封装
 */

import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, mkdirSync, renameSync } from 'fs'
import { homedir } from 'os'

let db: Database.Database | null = null

// 数据目录
const HALO_DATA_DIR = process.env.HALO_DATA_DIR || join(homedir(), '.halo')

// 确保数据目录存在
if (!existsSync(HALO_DATA_DIR)) {
  mkdirSync(HALO_DATA_DIR, { recursive: true })
}

const DB_PATH = join(HALO_DATA_DIR, 'halo.db')

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
  }
  return db
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

/**
 * 初始化数据库 Schema
 */
export function initializeDatabase(): void {
  const database = getDatabase()

  // 用户表
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)

  // 会话表
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // 空间表
  database.exec(`
    CREATE TABLE IF NOT EXISTS spaces (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // 对话表
  database.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      space_id TEXT,
      title TEXT,
      messages TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE SET NULL
    )
  `)

  // 配置表
  database.exec(`
    CREATE TABLE IF NOT EXISTS configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, key)
    )
  `)

  // 登录尝试表（用于账户锁定机制）
  database.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      attempt_time INTEGER NOT NULL
    )
  `)

  // 为登录尝试表创建索引
  database.exec('CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username)')

  // 应用表
  database.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      space_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      spec TEXT,
      config TEXT,
      last_run_at INTEGER,
      next_run_at INTEGER,
      error_count INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    )
  `)

  // 应用活动表
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_activities (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
    )
  `)

  // 通知渠道表
  database.exec(`
    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // 创建索引
  database.exec('CREATE INDEX IF NOT EXISTS idx_spaces_user_id ON spaces(user_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_configs_user_id ON configs(user_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_apps_user_id ON apps(user_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_apps_space_id ON apps(space_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_app_activities_app_id ON app_activities(app_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_notification_channels_user_id ON notification_channels(user_id)')
}

/**
 * 运行数据库迁移
 */
export function runMigrations(): void {
  const database = getDatabase()

  // 获取默认用户（用于关联现有数据）
  const defaultUser = database.prepare('SELECT id FROM users WHERE is_default = 1 LIMIT 1').get() as any
  const defaultUserId = defaultUser?.id || 'system'

  // ========================================
  // 迁移 spaces 表
  // ========================================
  const spacesTableInfo = database.pragma("table_info('spaces')") as any[]
  const spacesHasUserId = spacesTableInfo.some(col => col.name === 'user_id')

  if (!spacesHasUserId) {
    console.log('Running migration: adding user_id to spaces table')
    database.exec(`
      ALTER TABLE spaces ADD COLUMN user_id TEXT NOT NULL DEFAULT 'system'
    `)
  }

  // ========================================
  // 迁移 conversations 表
  // ========================================
  const conversationsTableInfo = database.pragma("table_info('conversations')") as any[]
  const conversationsHasUserId = conversationsTableInfo.some(col => col.name === 'user_id')

  if (!conversationsHasUserId) {
    console.log('Running migration: adding user_id to conversations table')
    database.exec(`
      ALTER TABLE conversations ADD COLUMN user_id TEXT NOT NULL DEFAULT 'system'
    `)
  }

  // ========================================
  // 迁移 configs 表
  // ========================================
  const configsTableInfo = database.pragma("table_info('configs')") as any[]
  const configsHasUserId = configsTableInfo.some(col => col.name === 'user_id')

  if (!configsHasUserId) {
    console.log('Running migration: adding user_id to configs table')
    database.exec(`
      ALTER TABLE configs ADD COLUMN user_id TEXT NOT NULL DEFAULT 'system'
    `)
  }

  // ========================================
  // 为现有数据关联默认用户
  // ========================================
  if (defaultUser) {
    database.exec(`UPDATE spaces SET user_id = '${defaultUserId}' WHERE user_id = 'system'`)
    database.exec(`UPDATE conversations SET user_id = '${defaultUserId}' WHERE user_id = 'system'`)
    database.exec(`UPDATE configs SET user_id = '${defaultUserId}' WHERE user_id = 'system'`)
  }

  // ========================================
  // 迁移空间目录到用户隔离结构
  // 将 ~/.halo/spaces/{id} 迁移到 ~/.halo/users/{user_id}/spaces/{id}
  // ========================================
  const allSpaces = database.prepare('SELECT id, user_id, path FROM spaces').all() as any[]
  for (const space of allSpaces) {
    const expectedPath = join(HALO_DATA_DIR, 'users', space.user_id, 'spaces', space.id)
    if (space.path !== expectedPath) {
      // 确保用户目录存在
      const userSpacesDir = join(HALO_DATA_DIR, 'users', space.user_id, 'spaces')
      if (!existsSync(userSpacesDir)) {
        mkdirSync(userSpacesDir, { recursive: true })
      }
      // 如果旧路径存在且新路径不存在，移动目录
      if (existsSync(space.path) && !existsSync(expectedPath)) {
        try {
          renameSync(space.path, expectedPath)
          console.log(`Migrated space directory: ${space.path} -> ${expectedPath}`)
        } catch (err) {
          console.warn(`Failed to migrate space directory ${space.path}:`, err)
        }
      }
      // 更新数据库中的路径
      database.prepare('UPDATE spaces SET path = ? WHERE id = ?').run(expectedPath, space.id)
    }
  }
}
