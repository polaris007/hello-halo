/**
 * FileExplorer - Main file explorer component
 *
 * Features:
 * - File tree with directory expansion
 * - Click to open files in ContentCanvas
 * - Collapsible sidebar
 * - Responsive behavior (hidden on mobile)
 */

import { useCallback } from 'react'
import { FolderOpen, RefreshCw, ChevronLeft, AlertCircle, Loader2, FilePlus, FolderPlus } from 'lucide-react'
import { FileTree } from './FileTree'
import { useFileExplorer } from './useFileExplorer'
import { api } from '../../api'
import { useTranslation } from '../../i18n'
import { canvasLifecycle } from '../../services/canvas-lifecycle'
import { useNotificationStore } from '../../stores/notification.store'

export interface FileExplorerProps {
  /** Current space ID */
  spaceId: string | null
  /** Whether the explorer is collapsed */
  isCollapsed?: boolean
  /** Callback when collapse state changes */
  onCollapsedChange?: (collapsed: boolean) => void
  /** Width of the file explorer */
  width?: number
  /** Ref for the container element */
  containerRef?: React.RefObject<HTMLDivElement>
  /** Callback for drag start */
  onDragStart?: (e: React.MouseEvent) => void
}

export function FileExplorer({
  spaceId,
  isCollapsed = false,
  onCollapsedChange,
  width = 240,
  containerRef,
  onDragStart
}: FileExplorerProps) {
  const { t } = useTranslation()
  const {
    files,
    expandedDirs,
    isLoading,
    error,
    toggleDir,
    refresh,
    refreshDir,
    refreshKey,
    dirRefreshKeys,
    dirCache
  } = useFileExplorer({ spaceId })

  // Handle file click - open in canvas
  const handleFileClick = useCallback((path: string) => {
    if (!spaceId) return

    // Use canvas lifecycle to open the file
    canvasLifecycle.openFile(path).catch(err => {
      console.error('Failed to open file:', err)
      useNotificationStore.getState().show({
        title: t('Failed to open file'),
        variant: 'error',
        duration: 4000,
      })
    })
  }, [spaceId, t])

  // Handle refresh
  const handleRefresh = useCallback(() => {
    refresh()
  }, [refresh])

  // Toggle collapse
  const handleToggleCollapse = useCallback(() => {
    onCollapsedChange?.(!isCollapsed)
  }, [isCollapsed, onCollapsedChange])

  // Handle create file
  const handleCreateFile = useCallback(async () => {
    if (!spaceId) return
    
    try {
      const response = await api.createFile(spaceId, '', 'new-file.txt', '')
      if (response.success) {
        useNotificationStore.getState().show({
          title: t('File created successfully'),
          variant: 'success',
          duration: 3000,
        })
        refresh()
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
    }
  }, [spaceId, refresh, t])

  // Handle create folder
  const handleCreateFolder = useCallback(async () => {
    if (!spaceId) return
    
    try {
      const response = await api.createFolder(spaceId, '', 'New Folder')
      if (response.success) {
        useNotificationStore.getState().show({
          title: t('Folder created successfully'),
          variant: 'success',
          duration: 3000,
        })
        refresh()
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
    }
  }, [spaceId, refresh, t])

  // Collapsed state - show only icons
  if (isCollapsed) {
    return (
      <div className="flex flex-col h-full bg-background border-l border-border w-12">
        {/* Header - icons only */}
        <div className="flex items-center justify-center p-2 border-b border-border">
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('Expand file explorer')}
          >
            <ChevronLeft size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Icon buttons */}
        <div className="flex flex-col items-center gap-2 p-2">
          <button
            onClick={handleCreateFile}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('New file')}
            disabled={isLoading}
          >
            <FilePlus size={16} className="text-muted-foreground" />
          </button>

          <button
            onClick={handleCreateFolder}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('New folder')}
            disabled={isLoading}
          >
            <FolderPlus size={16} className="text-muted-foreground" />
          </button>

          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('Refresh')}
            disabled={isLoading}
          >
            <RefreshCw
              size={16}
              className={`text-muted-foreground ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* File icons */}
        <div className="flex-1 overflow-y-auto p-1">
          {files.map(file => (
            <div
              key={file.path}
              className="flex items-center justify-center p-1.5 rounded hover:bg-accent cursor-pointer"
              onClick={() => file.isDirectory ? toggleDir(file.path) : handleFileClick(file.path)}
              title={file.name}
            >
              <div
                className={`
                  w-5 h-5 flex items-center justify-center
                  ${file.isDirectory ? 'text-amber-400' : 'text-muted-foreground'}
                `}
              >
                <FolderOpen size={16} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Expanded state
  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full bg-background border-l border-border relative"
      style={{
        width: `${width}px`,
        minWidth: '200px',
        maxWidth: '400px'
      }}
    >
      {/* Drag handle */}
      <div
        className={`
          absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20
          hover:bg-primary/50 transition-colors
        `}
        onMouseDown={onDragStart}
        title={t('Drag to resize')}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium">{t('Files')}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Create file button */}
          <button
            onClick={handleCreateFile}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('New file')}
            disabled={isLoading}
          >
            <FilePlus size={14} className="text-muted-foreground" />
          </button>

          {/* Create folder button */}
          <button
            onClick={handleCreateFolder}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('New folder')}
            disabled={isLoading}
          >
            <FolderPlus size={14} className="text-muted-foreground" />
          </button>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('Refresh')}
            disabled={isLoading}
          >
            <RefreshCw
              size={14}
              className={`text-muted-foreground ${isLoading ? 'animate-spin' : ''}`}
            />
          </button>

          {/* Collapse button */}
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 rounded hover:bg-accent transition-colors"
            title={t('Collapse file explorer')}
          >
            <ChevronLeft size={14} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-destructive bg-destructive/10 border-b border-destructive/20">
          <AlertCircle size={14} />
          <span className="truncate">{error}</span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && files.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="text-muted-foreground animate-spin" />
        </div>
      )}

      {/* File tree */}
      {!isLoading && files.length === 0 && !error ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {t('No files in this space')}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <FileTree
          files={files}
          spaceId={spaceId}
          expandedDirs={expandedDirs}
          onToggleDir={toggleDir}
          onFileClick={handleFileClick}
          refreshKey={refreshKey}
          refreshDir={refreshDir}
          dirRefreshKeys={dirRefreshKeys}
          dirCache={dirCache}
        />
        </div>
      )}
    </div>
  )
}
