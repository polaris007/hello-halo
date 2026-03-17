#!/usr/bin/env node

/**
 * Data Directory Migration Script
 *
 * Migrates data from ~/.halo/ to the new data directory structure.
 * Usage: node scripts/migrate-data-dir.js [options]
 *
 * Options:
 *   --target-dir <path>  Target data directory (default: ./data)
 *   --dry-run            Show what would be done without making changes
 *   --force              Overwrite existing files in target directory
 *   --help               Show this help message
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Parse command line arguments
const args = process.argv.slice(2)
const options = {
  targetDir: null,
  dryRun: false,
  force: false,
  help: false
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--target-dir') {
    options.targetDir = args[++i]
  } else if (arg === '--dry-run') {
    options.dryRun = true
  } else if (arg === '--force') {
    options.force = true
  } else if (arg === '--help' || arg === '-h') {
    options.help = true
  }
}

// Show help
if (options.help) {
  console.log(`
Data Directory Migration Script

Migrates data from ~/.halo/ to the new data directory structure.

Usage: node scripts/migrate-data-dir.js [options]

Options:
  --target-dir <path>  Target data directory (default: ./data)
  --dry-run            Show what would be done without making changes
  --force              Overwrite existing files in target directory
  --help, -h           Show this help message

Examples:
  node scripts/migrate-data-dir.js
  node scripts/migrate-data-dir.js --target-dir /var/lib/halo
  node scripts/migrate-data-dir.js --dry-run
`)
  process.exit(0)
}

// Source and target directories
const sourceDir = path.join(os.homedir(), '.halo')
const targetDir = options.targetDir
  ? path.resolve(options.targetDir)
  : path.join(process.cwd(), 'data')

// Migration report
const report = {
  sourceDir,
  targetDir,
  dryRun: options.dryRun,
  startTime: new Date().toISOString(),
  items: [],
  errors: [],
  summary: {
    filesCopied: 0,
    directoriesCreated: 0,
    bytesTransferred: 0,
    errors: 0
  }
}

/**
 * Add an item to the migration report
 */
function addReportItem(type, source, target, status, details = null) {
  report.items.push({
    type,
    source,
    target,
    status,
    details,
    timestamp: new Date().toISOString()
  })

  if (status === 'success') {
    if (type === 'file') {
      report.summary.filesCopied++
      try {
        const stats = fs.statSync(source)
        report.summary.bytesTransferred += stats.size
      } catch (e) {
        // Ignore stat errors
      }
    } else if (type === 'directory') {
      report.summary.directoriesCreated++
    }
  } else if (status === 'error') {
    report.summary.errors++
    report.errors.push({ source, target, details })
  }
}

/**
 * Copy a file from source to target
 */
function copyFile(source, target) {
  const targetDir = path.dirname(target)

  // Create target directory if it doesn't exist
  if (!fs.existsSync(targetDir)) {
    if (options.dryRun) {
      console.log(`[DRY-RUN] Would create directory: ${targetDir}`)
    } else {
      fs.mkdirSync(targetDir, { recursive: true })
      addReportItem('directory', null, targetDir, 'success')
    }
  }

  // Check if target exists
  if (fs.existsSync(target)) {
    if (!options.force) {
      addReportItem('file', source, target, 'skipped', 'Target exists (use --force to overwrite)')
      return
    }
  }

  if (options.dryRun) {
    console.log(`[DRY-RUN] Would copy: ${source} -> ${target}`)
    addReportItem('file', source, target, 'dry-run')
    return
  }

  try {
    fs.copyFileSync(source, target)
    addReportItem('file', source, target, 'success')
  } catch (error) {
    addReportItem('file', source, target, 'error', error.message)
  }
}

/**
 * Recursively copy a directory
 */
function copyDirectory(source, target) {
  // Create target directory
  if (!fs.existsSync(target)) {
    if (options.dryRun) {
      console.log(`[DRY-RUN] Would create directory: ${target}`)
    } else {
      fs.mkdirSync(target, { recursive: true })
      addReportItem('directory', source, target, 'success')
    }
  }

  // Read source directory
  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath)
    } else if (entry.isFile()) {
      copyFile(sourcePath, targetPath)
    }
  }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Main migration function
 */
function migrate() {
  console.log('========================================')
  console.log('Halo Data Directory Migration')
  console.log('========================================')
  console.log(`Source: ${sourceDir}`)
  console.log(`Target: ${targetDir}`)
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  console.log('========================================\n')

  // Check if source directory exists
  if (!fs.existsSync(sourceDir)) {
    console.log(`Source directory does not exist: ${sourceDir}`)
    console.log('Nothing to migrate.')
    process.exit(0)
  }

  // Check if target directory exists
  if (fs.existsSync(targetDir) && !options.force) {
    const entries = fs.readdirSync(targetDir)
    if (entries.length > 0) {
      console.log(`Target directory already exists and is not empty: ${targetDir}`)
      console.log('Use --force to overwrite existing files.')
      process.exit(1)
    }
  }

  // Items to migrate
  const itemsToMigrate = [
    { name: 'halo.db', type: 'database', description: 'Database file' },
    { name: 'halo.db-wal', type: 'database', description: 'Database WAL file', optional: true },
    { name: 'halo.db-shm', type: 'database', description: 'Database SHM file', optional: true },
    { name: 'server.json', type: 'config', description: 'Configuration file', optional: true },
    { name: 'config.json', type: 'config', description: 'MCP config file', optional: true },
    { name: 'llm-config.json', type: 'config', description: 'LLM config file', optional: true },
    { name: 'users', type: 'directory', description: 'User data directory' },
    { name: 'logs', type: 'directory', description: 'Log files', optional: true }
  ]

  console.log('Migrating items:\n')

  for (const item of itemsToMigrate) {
    const sourcePath = path.join(sourceDir, item.name)

    if (!fs.existsSync(sourcePath)) {
      if (item.optional) {
        console.log(`  [SKIP] ${item.name}: Not found (optional)`)
      } else {
        console.log(`  [SKIP] ${item.name}: Not found`)
      }
      continue
    }

    const targetPath = path.join(targetDir, item.name)

    console.log(`  [MIGRATING] ${item.name}: ${item.description}`)

    if (item.type === 'directory') {
      copyDirectory(sourcePath, targetPath)
    } else {
      copyFile(sourcePath, targetPath)
    }
  }

  report.endTime = new Date().toISOString()

  // Print summary
  console.log('\n========================================')
  console.log('Migration Summary')
  console.log('========================================')
  console.log(`Files copied: ${report.summary.filesCopied}`)
  console.log(`Directories created: ${report.summary.directoriesCreated}`)
  console.log(`Bytes transferred: ${formatBytes(report.summary.bytesTransferred)}`)
  console.log(`Errors: ${report.summary.errors}`)

  if (options.dryRun) {
    console.log('\nThis was a DRY RUN. No changes were made.')
    console.log('Run without --dry-run to perform the actual migration.')
  }

  if (report.errors.length > 0) {
    console.log('\nErrors encountered:')
    for (const error of report.errors) {
      console.log(`  - ${error.source}: ${error.details}`)
    }
    process.exit(1)
  }

  console.log('\nMigration completed successfully!')

  // Print post-migration instructions
  console.log('\n========================================')
  console.log('Next Steps')
  console.log('========================================')
  console.log('1. Verify the migrated data in: ' + targetDir)
  console.log('2. Update your environment variables if needed:')
  console.log('   export HALO_DATA_DIR=' + targetDir)
  console.log('3. Start Halo to use the new data directory')
  console.log('4. (Optional) Remove the old data directory after verification:')
  console.log('   rm -rf ' + sourceDir)
}

// Run migration
migrate()
