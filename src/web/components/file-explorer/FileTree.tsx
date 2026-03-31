/**
 * FileTree - Recursive file tree component with expand/collapse
 *
 * Features:
 * - Recursive directory expansion
 * - File/folder icons
 * - Click to open files
 * - Lazy loading of subdirectories
 * - Right-click context menu with file operations
 */

import { useCallback, useState, useEffect, useRef } from 'react'
import { ChevronRight, ChevronDown, Loader2, FilePlus, FolderPlus, Edit, Trash2, Copy } from 'lucide-react'
import { FileIcon } from './FileIcon'
import type { FileEntry } from './useFileExplorer'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { useNotificationStore } from '../../stores/notification.store'

interface FileItemProps {
  file: FileEntry
  spaceId: string | null
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
  onFileClick: (path: string) => void
  depth: number
  maxDepth: number
  loadChildren: (path: string) => Promise<FileEntry[]>
  refreshDir: (path: string) => Promise<FileEntry[]>
  dirRefreshKeys: Map<string, number>
  dirCache: Map<string, FileEntry[]>
}

function FileItemComponent({
  file,
  spaceId,
  expandedDirs,
  onToggleDir,
  onFileClick,
  depth,
  maxDepth,
  loadChildren,
  refreshDir,
  dirRefreshKeys,
  dirCache
}: FileItemProps) {
  const { t } = useTranslation()
  const [children, setChildren] = useState<FileEntry[]>([])
  const [isLoadingChildren, setIsLoadingChildren] = useState(false)
  const [childrenLoaded, setChildrenLoaded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(file.name)
  const [isLoading, setIsLoading] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const isExpanded = file.isDirectory && expandedDirs.has(file.path)
  const canExpand = file.isDirectory && depth < maxDepth

  // Get refresh key for this directory to detect when it needs to be reloaded
  const dirRefreshKey = dirRefreshKeys.get(file.path) || 0

  // Load children when expanded
  useEffect(() => {
    if (isExpanded && canExpand) {
      setIsLoadingChildren(true)
      loadChildren(file.path).then(loadedChildren => {
        setChildren(loadedChildren)
        setChildrenLoaded(true)
        setIsLoadingChildren(false)
      })
    }
  }, [isExpanded, canExpand, file.path, loadChildren, dirRefreshKey])

  // Focus rename input when renaming starts
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleClick = useCallback(() => {
    if (file.isDirectory) {
      onToggleDir(file.path)
    } else {
      onFileClick(file.path)
    }
  }, [file, onToggleDir, onFileClick])

  const handleRightClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCreateFile = useCallback(async () => {
    if (!spaceId) return
    setContextMenu(null)

    const fileName = 'new-file.txt'
    const parentPath = file.isDirectory ? file.path : file.path.substring(0, file.path.lastIndexOf('/'))

    try {
      setIsLoading(true)
      const response = await api.createFile(spaceId, parentPath, fileName, '')
      if (response.success) {
        useNotificationStore.getState().show({
          title: t('File created successfully'),
          variant: 'success',
          duration: 3000,
        })
        // Refresh the parent directory - this will update cache and trigger re-render
        await refreshDir(parentPath)
      } else {
        useNotificationStore.getState().show({
          title: t('Failed to create file'),
          variant: 'error',
          duration: 4000,
        })
      }
    } catch (error) {
      useNotificationStore.getState().show({
        title: t('Failed to create file'),
        variant: 'error',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [spaceId, file, refreshDir, t])

  const handleCreateFolder = useCallback(async () => {
    if (!spaceId) return
    setContextMenu(null)

    const folderName = 'New Folder'
    const parentPath = file.isDirectory ? file.path : file.path.substring(0, file.path.lastIndexOf('/'))

    try {
      setIsLoading(true)
      const response = await api.createFolder(spaceId, parentPath, folderName)
      if (response.success) {
        useNotificationStore.getState().show({
          title: t('Folder created successfully'),
          variant: 'success',
          duration: 3000,
        })
        // Refresh the parent directory - this will update cache and trigger re-render
        await refreshDir(parentPath)
      } else {
        useNotificationStore.getState().show({
          title: t('Failed to create folder'),
          variant: 'error',
          duration: 4000,
        })
      }
    } catch (error) {
      useNotificationStore.getState().show({
        title: t('Failed to create folder'),
        variant: 'error',
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }, [spaceId, file, refreshDir, t])

  const handleRename = useCallback(() => {
    setContextMenu(null)
    setIsRenaming(true)
  }, [])

  const handleRenameSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!spaceId || newName === file.name) {
      setIsRenaming(false)
      return
    }

    try {
      setIsLoading(true)
      const response = await api.renameFile(spaceId, file.path, newName)
      if (response.success) {
        useNotificationStore.getState().show({
          title: t('Renamed successfully'),
          variant: 'success',
          duration: 3000,
        })
        // Refresh the parent directory - this will update cache and trigger re-render
        const parentPath = file.path.substring(0, file.path.lastIndexOf('/'))
        await refreshDir(parentPath)
      } else {
        useNotificationStore.getState().show({
          title: t('Failed to rename'),
          variant: 'error',
          duration: 4000,
        })
      }
    } catch (error) {
      useNotificationStore.getState().show({
        title: t('Failed to rename'),
        variant: 'error',
        duration: 4000,
      })
    } finally {
      setIsRenaming(false)
      setIsLoading(false)
    }
  }, [spaceId, file, newName, refreshDir, t])

  const handleDelete = useCallback(async () => {
    if (!spaceId) return
    setContextMenu(null)

    if (confirm(t('Are you sure you want to delete this item?'))) {
      try {
        setIsLoading(true)
        const response = await api.deleteFile(spaceId, file.path)
        if (response.success) {
          useNotificationStore.getState().show({
            title: t('Deleted successfully'),
            variant: 'success',
            duration: 3000,
          })
          // Refresh the parent directory - this will update cache and trigger re-render
          const parentPath = file.path.substring(0, file.path.lastIndexOf('/'))
          await refreshDir(parentPath)
        } else {
          useNotificationStore.getState().show({
            title: t('Failed to delete'),
            variant: 'error',
            duration: 4000,
          })
        }
      } catch (error) {
        useNotificationStore.getState().show({
          title: t('Failed to delete'),
          variant: 'error',
          duration: 4000,
        })
      } finally {
        setIsLoading(false)
      }
    }
  }, [spaceId, file, refreshDir, t])

  const handleCopyRelativePath = useCallback(async () => {
    setContextMenu(null)
    await navigator.clipboard.writeText(file.path)
    useNotificationStore.getState().show({
      title: t('Relative path copied to clipboard'),
      variant: 'success',
      duration: 2000,
    })
  }, [file.path, t])

  const handleCopyAbsolutePath = useCallback(async () => {
    setContextMenu(null)
    try {
      if (!spaceId) return
      console.log('Calling getAbsolutePath for:', file.path)
      const response = await api.getAbsolutePath(spaceId, file.path)
      console.log('API response:', response)
      if (response.success && response.data?.absolutePath) {
        console.log('Copying absolute path:', response.data.absolutePath)
        await navigator.clipboard.writeText(response.data.absolutePath)
        useNotificationStore.getState().show({
          title: t('Absolute path copied to clipboard'),
          variant: 'success',
          duration: 2000,
        })
      } else {
        console.log('API call failed, falling back to relative path')
        // Fallback to relative path if absolute path fails
        await navigator.clipboard.writeText(file.path)
        useNotificationStore.getState().show({
          title: t('Relative path copied to clipboard'),
          variant: 'success',
          duration: 2000,
        })
      }
    } catch (error) {
      console.error('Error in handleCopyAbsolutePath:', error)
      // Fallback to relative path if API call fails
      await navigator.clipboard.writeText(file.path)
      useNotificationStore.getState().show({
        title: t('Relative path copied to clipboard'),
        variant: 'success',
        duration: 2000,
      })
    }
  }, [file.path, spaceId, t])

  const paddingLeft = depth * 12

  return (
    <div style={{ position: 'relative' }}>
      {/* Item row */}
      <div
        className={`
          flex items-center gap-1.5 py-1 px-2
          cursor-pointer select-none
          hover:bg-accent/50 rounded
          transition-colors
          ${!file.isDirectory ? 'text-foreground/80' : 'text-foreground'}
        `}
        style={{ paddingLeft: paddingLeft + 8 }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
      >
        {/* Expand arrow for directories */}
        {file.isDirectory && canExpand ? (
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {isLoadingChildren ? (
              <Loader2 size={12} className="text-muted-foreground animate-spin" />
            ) : isExpanded ? (
              <ChevronDown size={14} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={14} className="text-muted-foreground" />
            )}
          </div>
        ) : (
          <div className="w-4 h-4 flex-shrink-0" />
        )}

        {/* File/Folder icon */}
        <FileIcon
          name={file.name}
          isDirectory={file.isDirectory}
          isExpanded={isExpanded}
          size={14}
        />

        {/* Name or rename input */}
        {isRenaming ? (
          <form onSubmit={handleRenameSubmit} className="flex-1">
            <input
              ref={renameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsRenaming(false)
              }}
              className="text-sm border border-input rounded px-1 py-0.5 bg-background"
              style={{ width: '100%' }}
            />
          </form>
        ) : (
          <span className="text-sm truncate flex-1">
            {file.name}
          </span>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded-md shadow-lg py-1 min-w-[180px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            right: 'auto',
            bottom: 'auto',
            zIndex: 9999
          }}
        >
          {/* Create file (only for directories) */}
          {file.isDirectory && (
            <button
              onClick={handleCreateFile}
              className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              <FilePlus size={14} />
              {t('New file')}
            </button>
          )}

          {/* Create folder (for both files and directories) */}
          <button
            onClick={handleCreateFolder}
            className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            <FolderPlus size={14} />
            {t('New folder')}
          </button>

          <div className="border-t border-border my-1" />

          {/* Rename */}
          <button
            onClick={handleRename}
            className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            <Edit size={14} />
            {t('Rename')}
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            <Trash2 size={14} />
            {t('Delete')}
          </button>

          <div className="border-t border-border my-1" />

          {/* Copy relative path */}
          <button
            onClick={handleCopyRelativePath}
            className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            <Copy size={14} />
            {t('Copy relative path')}
          </button>

          {/* Copy absolute path */}
          <button
            onClick={handleCopyAbsolutePath}
            className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent w-full text-left disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            <Copy size={14} />
            {t('Copy absolute path')}
          </button>
        </div>
      )}

      {/* Children (recursive) */}
      {isExpanded && childrenLoaded && children.length > 0 && (
        <div>
          {children.map(child => (
            <FileItemComponent
              key={child.path}
              file={child}
              spaceId={spaceId}
              expandedDirs={expandedDirs}
              onToggleDir={onToggleDir}
              onFileClick={onFileClick}
              depth={depth + 1}
              maxDepth={maxDepth}
              loadChildren={loadChildren}
              refreshDir={refreshDir}
              dirRefreshKeys={dirRefreshKeys}
              dirCache={dirCache}
            />
          ))}
        </div>
      )}

      {/* Empty folder message */}
      {isExpanded && childrenLoaded && children.length === 0 && (
        <div
          className="text-xs text-muted-foreground/50 py-1 px-2"
          style={{ paddingLeft: paddingLeft + 32 }}
        >
          {t('Empty folder')}
        </div>
      )}
    </div>
  )
}

// Note: Not using memo() because dirRefreshKeys Map changes need to trigger re-renders
const FileItem = FileItemComponent

export interface FileTreeProps {
  /** Files to display */
  files: FileEntry[]
  /** Current space ID */
  spaceId: string | null
  /** Set of expanded directory paths */
  expandedDirs: Set<string>
  /** Toggle directory expansion */
  onToggleDir: (path: string) => void
  /** Callback when a file is clicked */
  onFileClick: (path: string) => void
  /** Current depth for indentation */
  depth?: number
  /** Maximum depth to render */
  maxDepth?: number
  /** Refresh key to force reload */
  refreshKey?: number
  /** Refresh a specific directory */
  refreshDir: (path: string) => Promise<FileEntry[]>
  /** Directory refresh keys for triggering re-render */
  dirRefreshKeys: Map<string, number>
  /** Directory cache */
  dirCache: Map<string, FileEntry[]>
}

export function FileTree({
  files,
  spaceId,
  expandedDirs,
  onToggleDir,
  onFileClick,
  depth = 0,
  maxDepth = 10,
  refreshKey = 0,
  refreshDir,
  dirRefreshKeys,
  dirCache
}: FileTreeProps) {
  const { t } = useTranslation()

  // Function to load children for a directory - uses cache when available
  const loadChildren = useCallback(async (path: string): Promise<FileEntry[]> => {
    // Check cache first
    const cached = dirCache.get(path)
    if (cached) {
      return cached
    }

    if (!spaceId) return []

    try {
      const response = await api.listFiles(spaceId, path)
      if (response.success && response.data) {
        return [...response.data.files].sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
      }
    } catch (err) {
      console.error('Failed to load children:', err)
    }
    return []
  }, [spaceId, dirCache])

  if (files.length === 0) {
    return (
      <div className="py-4 px-4 text-center text-sm text-muted-foreground/50">
        {t('No files in this directory')}
      </div>
    )
  }

  return (
    <div className="py-1">
      {files.map(file => (
        <FileItem
          key={`${file.path}-${refreshKey}`}
          file={file}
          spaceId={spaceId}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          onFileClick={onFileClick}
          depth={depth}
          maxDepth={maxDepth}
          loadChildren={loadChildren}
          refreshDir={refreshDir}
          dirRefreshKeys={dirRefreshKeys}
          dirCache={dirCache}
        />
      ))}
    </div>
  )
}
