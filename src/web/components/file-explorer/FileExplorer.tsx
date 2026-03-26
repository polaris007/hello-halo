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
import { FolderOpen, RefreshCw, ChevronLeft, AlertCircle, Loader2 } from 'lucide-react'
import { FileTree } from './FileTree'
import { useFileExplorer } from './useFileExplorer'
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
}

export function FileExplorer({
  spaceId,
  isCollapsed = false,
  onCollapsedChange
}: FileExplorerProps) {
  const { t } = useTranslation()
  const {
    files,
    expandedDirs,
    isLoading,
    error,
    toggleDir,
    refresh
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
    <div className="flex flex-col h-full bg-background border-l border-border min-w-[200px] max-w-[300px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FolderOpen size={16} className="text-muted-foreground" />
          <span className="text-sm font-medium">{t('Files')}</span>
        </div>

        <div className="flex items-center gap-1">
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
          />
        </div>
      )}
    </div>
  )
}
