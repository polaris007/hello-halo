/**
 * useFileExplorer - Custom hook for FileExplorer state management
 *
 * Features:
 * - File listing with API integration
 * - Directory expansion state
 * - Loading and error states
 * - File refresh capability
 */

import { useState, useCallback, useEffect } from 'react'
import { api } from '../../api'

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedAt: string
}

export interface UseFileExplorerOptions {
  spaceId: string | null
}

export interface UseFileExplorerReturn {
  /** Current directory path */
  currentPath: string
  /** Files in current directory */
  files: FileEntry[]
  /** Set of expanded directory paths */
  expandedDirs: Set<string>
  /** Whether data is loading */
  isLoading: boolean
  /** Error message if any */
  error: string | null
  /** Expand a directory */
  expandDir: (path: string) => void
  /** Collapse a directory */
  collapseDir: (path: string) => void
  /** Toggle directory expansion */
  toggleDir: (path: string) => void
  /** Check if directory is expanded */
  isExpanded: (path: string) => boolean
  /** Navigate to a directory */
  navigateTo: (path: string) => void
  /** Refresh current directory */
  refresh: () => Promise<void>
  /** Load directory contents */
  loadDir: (path: string) => Promise<void>
}

export function useFileExplorer({ spaceId }: UseFileExplorerOptions): UseFileExplorerReturn {
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Cache for loaded directories
  const [dirCache, setDirCache] = useState<Map<string, FileEntry[]>>(new Map())

  // Load directory contents
  const loadDir = useCallback(async (path: string) => {
    if (!spaceId) return

    // Check cache first
    if (dirCache.has(path)) {
      setFiles(dirCache.get(path) || [])
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await api.listFiles(spaceId, path)
      if (response.success && response.data) {
        // Sort: folders first, then files, both alphabetically
        const sortedFiles = [...response.data.files].sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })

        setFiles(sortedFiles)
        setDirCache(prev => new Map(prev).set(path, sortedFiles))
      } else {
        setError(response.error || 'Failed to load files')
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsLoading(false)
    }
  }, [spaceId, dirCache])

  // Load root on mount or space change
  useEffect(() => {
    if (spaceId) {
      loadDir('')
      setCurrentPath('')
      setExpandedDirs(new Set())
      setDirCache(new Map()) // Clear cache on space change
    }
  }, [spaceId]) // Don't include loadDir to avoid infinite loop

  const expandDir = useCallback((path: string) => {
    setExpandedDirs(prev => new Set(prev).add(path))
  }, [])

  const collapseDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const isExpanded = useCallback((path: string) => {
    return expandedDirs.has(path)
  }, [expandedDirs])

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path)
    loadDir(path)
  }, [loadDir])

  const refresh = useCallback(async () => {
    // Clear cache for current path
    setDirCache(prev => {
      const next = new Map(prev)
      next.delete(currentPath)
      return next
    })
    await loadDir(currentPath)
  }, [currentPath, loadDir])

  return {
    currentPath,
    files,
    expandedDirs,
    isLoading,
    error,
    expandDir,
    collapseDir,
    toggleDir,
    isExpanded,
    navigateTo,
    refresh,
    loadDir
  }
}
