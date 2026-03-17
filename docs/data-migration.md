# Data Migration Guide

This guide explains how to migrate your data from the old `~/.halo/` directory to the new data directory structure.

## Overview

Starting from this version, Halo uses `{cwd}/data/` as the default data directory instead of `~/.halo/`. This change supports Docker deployments and makes data management more flexible.

## Migration Tool

Halo provides a migration script to help you move your data:

```bash
node scripts/migrate-data-dir.js
```

### Migration Options

| Option | Description |
|--------|-------------|
| `--target-dir <path>` | Target data directory (default: `./data`) |
| `--dry-run` | Show what would be done without making changes |
| `--force` | Overwrite existing files in target directory |
| `--help` | Show help message |

### Examples

```bash
# Preview migration (no changes)
node scripts/migrate-data-dir.js --dry-run

# Migrate to default ./data directory
node scripts/migrate-data-dir.js

# Migrate to custom directory
node scripts/migrate-data-dir.js --target-dir /var/lib/halo

# Force overwrite existing files
node scripts/migrate-data-dir.js --force
```

## Manual Migration

If you prefer to migrate manually:

### 1. Stop Halo

Ensure Halo is not running before migrating.

### 2. Create Target Directory

```bash
mkdir -p ./data
```

### 3. Copy Data Files

```bash
# Copy database
cp ~/.halo/halo.db ./data/

# Copy user data directories
cp -r ~/.halo/users ./data/

# Copy configuration (if exists)
cp ~/.halo/server.json ./data/ 2>/dev/null || true
cp ~/.halo/config.json ./data/ 2>/dev/null || true

# Copy logs (optional)
cp -r ~/.halo/logs ./data/ 2>/dev/null || true
```

### 4. Verify Migration

Start Halo and verify everything works:

```bash
npm start
```

### 5. Clean Up (Optional)

After verifying the migration, you can remove the old data directory:

```bash
rm -rf ~/.halo
```

## Using Old Data Directory

If you want to continue using the old `~/.halo/` directory, you can configure Halo to use it:

### Environment Variable

```bash
export HALO_DATA_DIR=~/.halo
npm start
```

### Command Line

```bash
node server.js --data-dir ~/.halo
```

### Configuration File

Create or update `server.json`:

```json
{
  "data": {
    "basePath": "~/.halo"
  }
}
```

## Directory Structure

### Old Structure

```
~/.halo/
├── halo.db
├── server.json
├── users/
│   └── {user_id}/
│       └── spaces/
│           └── {space_id}/
└── logs/
```

### New Structure

```
{cwd}/data/
├── halo.db
├── server.json
├── users/
│   └── {user_id}/
│       └── spaces/
│           └── {space_id}/
└── logs/
```

The internal structure remains the same; only the root directory changes.

## Docker Migration

When migrating to Docker:

1. Run the migration script to copy data to `./data`
2. Use the `./data` directory as a volume mount:

```yaml
volumes:
  - ./data:/app/data
```

## Configuration Priority

Halo resolves the data directory in this order:

1. Command line argument: `--data-dir <path>` (highest priority)
2. Environment variable: `HALO_DATA_DIR`
3. Configuration file: `data.basePath` in `server.json`
4. Default: `{cwd}/data/` (lowest priority)

## Troubleshooting

### "Legacy data directory detected" Message

If you see this message at startup, it means Halo detected data in `~/.halo/`. Run the migration script or set `HALO_DATA_DIR=~/.halo` to use the old location.

### Permission Errors

Ensure you have read permissions for the source directory and write permissions for the target directory.

### Database Locked

Ensure Halo is not running during migration.

### Missing Data After Migration

1. Verify the target directory has all files
2. Check the migration report for errors
3. Run with `--dry-run` first to preview the migration
