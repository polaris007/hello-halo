/**
 * Registry Cache
 *
 * File-system based cache for registry index and spec files.
 * Cache directory: {userData}/store-cache/
 *
 * Structure:
 *   store-cache/
 *   +-- {registryId}/
 *   |   +-- index.json        # Cached registry index
 *   |   +-- specs/
 *   |       +-- {slug}.yaml   # Cached spec files
 */
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { getHaloDir } from '../services/config.service';
/** Name of the cache directory under the Halo data directory */
const CACHE_DIR_NAME = 'store-cache';
/** Metadata suffix for cache entries (stores fetchedAt timestamp) */
const META_SUFFIX = '.meta.json';
// ============================================
// Cache Directory
// ============================================
/**
 * Get the root cache directory path.
 * Creates the directory if it does not exist.
 */
export function getCacheDir() {
    const dir = join(getHaloDir(), CACHE_DIR_NAME);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
/**
 * Get the cache directory for a specific registry.
 * Creates the directory if it does not exist.
 */
function getRegistryCacheDir(registryId) {
    const dir = join(getCacheDir(), registryId);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
/**
 * Get the specs cache directory for a specific registry.
 * Creates the directory if it does not exist.
 */
function getSpecsCacheDir(registryId) {
    const dir = join(getRegistryCacheDir(registryId), 'specs');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}
// ============================================
// Index Cache
// ============================================
/**
 * Read a cached registry index from disk.
 * Returns null if the cache file does not exist or cannot be read.
 */
export function readCachedIndex(registryId) {
    try {
        const indexPath = join(getRegistryCacheDir(registryId), 'index.json');
        const metaPath = indexPath + META_SUFFIX;
        if (!existsSync(indexPath) || !existsSync(metaPath)) {
            return null;
        }
        const indexContent = readFileSync(indexPath, 'utf-8');
        const metaContent = readFileSync(metaPath, 'utf-8');
        const index = JSON.parse(indexContent);
        const meta = JSON.parse(metaContent);
        return {
            index,
            fetchedAt: meta.fetchedAt,
            registryId,
        };
    }
    catch (error) {
        console.error(`[RegistryCache] Failed to read cached index for ${registryId}:`, error);
        return null;
    }
}
/**
 * Write a registry index to the disk cache with a timestamp.
 */
export function writeCachedIndex(registryId, index) {
    try {
        const dir = getRegistryCacheDir(registryId);
        const indexPath = join(dir, 'index.json');
        const metaPath = indexPath + META_SUFFIX;
        writeFileSync(indexPath, JSON.stringify(index, null, 2));
        writeFileSync(metaPath, JSON.stringify({ fetchedAt: Date.now() }));
    }
    catch (error) {
        console.error(`[RegistryCache] Failed to write cached index for ${registryId}:`, error);
    }
}
// ============================================
// Spec Cache
// ============================================
/**
 * Read a cached spec from disk.
 * Returns null if the cache file does not exist or cannot be read.
 */
export function readCachedSpec(registryId, slug) {
    try {
        const specsDir = getSpecsCacheDir(registryId);
        const specPath = join(specsDir, `${slug}.json`);
        const metaPath = specPath + META_SUFFIX;
        if (!existsSync(specPath) || !existsSync(metaPath)) {
            return null;
        }
        const specContent = readFileSync(specPath, 'utf-8');
        const metaContent = readFileSync(metaPath, 'utf-8');
        const spec = JSON.parse(specContent);
        const meta = JSON.parse(metaContent);
        return {
            spec,
            key: `${registryId}:${slug}`,
            fetchedAt: meta.fetchedAt,
        };
    }
    catch (error) {
        console.error(`[RegistryCache] Failed to read cached spec for ${registryId}:${slug}:`, error);
        return null;
    }
}
/**
 * Write a parsed spec to the disk cache with a timestamp.
 * The spec is stored as JSON (not YAML) for fast reads.
 */
export function writeCachedSpec(registryId, slug, spec) {
    try {
        const specsDir = getSpecsCacheDir(registryId);
        const specPath = join(specsDir, `${slug}.json`);
        const metaPath = specPath + META_SUFFIX;
        writeFileSync(specPath, JSON.stringify(spec, null, 2));
        writeFileSync(metaPath, JSON.stringify({ fetchedAt: Date.now() }));
    }
    catch (error) {
        console.error(`[RegistryCache] Failed to write cached spec for ${registryId}:${slug}:`, error);
    }
}
// ============================================
// Cache Management
// ============================================
/**
 * Clear all cached data, or cached data for a specific registry.
 *
 * @param registryId - If provided, only clear this registry's cache.
 *                     If omitted, clear the entire store-cache directory.
 */
export function clearCache(registryId) {
    try {
        if (registryId) {
            const dir = join(getCacheDir(), registryId);
            if (existsSync(dir)) {
                rmSync(dir, { recursive: true, force: true });
                console.log(`[RegistryCache] Cleared cache for registry: ${registryId}`);
            }
        }
        else {
            const dir = getCacheDir();
            if (existsSync(dir)) {
                rmSync(dir, { recursive: true, force: true });
                console.log('[RegistryCache] Cleared all cache');
            }
        }
    }
    catch (error) {
        console.error('[RegistryCache] Failed to clear cache:', error);
    }
}
/**
 * Get cache statistics: total file count and total size in bytes.
 */
export function getCacheStats() {
    const stats = { totalFiles: 0, totalSizeBytes: 0 };
    try {
        const cacheDir = getCacheDir();
        if (!existsSync(cacheDir)) {
            return stats;
        }
        accumulateStats(cacheDir, stats);
    }
    catch (error) {
        console.error('[RegistryCache] Failed to get cache stats:', error);
    }
    return stats;
}
/**
 * Recursively accumulate file count and size for a directory.
 */
function accumulateStats(dir, stats) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            accumulateStats(fullPath, stats);
        }
        else if (entry.isFile()) {
            stats.totalFiles++;
            try {
                const fileStat = statSync(fullPath);
                stats.totalSizeBytes += fileStat.size;
            }
            catch {
                // Skip files we cannot stat
            }
        }
    }
}
//# sourceMappingURL=registry.cache.js.map