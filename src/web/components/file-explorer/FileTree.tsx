/**
 * FileTree - Recursive file tree component with expand/collapse
 *
 * Features:
 * - Recursive directory expansion
 * - File/folder icons
 * - Click to open files
 * - Lazy loading of subdirectories
 */

import { memo, useCallback, useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react'
import { FileIcon } from './FileIcon'
import type { FileEntry } from './useFileExplorer'
import { api } from '../../api'
import { useTranslation } from '../../i18n'

interface FileItemProps {
  file: FileEntry
  spaceId: string | null
  expandedDirs: Set<string>
  onToggleDir: (path: string) => void
  onFileClick: (path: string) => void
  depth: number
  maxDepth: number
  loadChildren: (path: string) => Promise<FileEntry[]>
}

function FileItemComponent({
  file,
  spaceId,
  expandedDirs,
  onToggleDir,
  onFileClick,
  depth,
  maxDepth,
  loadChildren
}: FileItemProps) {
  const { t } = useTranslation()
  const [children, setChildren] = useState<FileEntry[]>([])
  const [isLoadingChildren, setIsLoadingChildren] = useState(false)
  const [childrenLoaded, setChildrenLoaded] = useState(false)

  const isExpanded = file.isDirectory && expandedDirs.has(file.path)
  const canExpand = file.isDirectory && depth < maxDepth

  // Load children when expanded
  useEffect(() => {
    if (isExpanded && !childrenLoaded && canExpand) {
      setIsLoadingChildren(true)
      loadChildren(file.path).then(loadedChildren => {
        setChildren(loadedChildren)
        setChildrenLoaded(true)
        setIsLoadingChildren(false)
      })
    }
  }, [isExpanded, childrenLoaded, canExpand, file.path, loadChildren])

  const handleClick = useCallback(() => {
    if (file.isDirectory) {
      onToggleDir(file.path)
    } else {
      onFileClick(file.path)
    }
  }, [file, onToggleDir, onFileClick])

  const paddingLeft = depth * 12

  return (
    <div>
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

        {/* Name */}
        <span className="text-sm truncate">
          {file.name}
        </span>
      </div>

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

const FileItem = memo(FileItemComponent)

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
}

export function FileTree({
  files,
  spaceId,
  expandedDirs,
  onToggleDir,
  onFileClick,
  depth = 0,
  maxDepth = 10
}: FileTreeProps) {
  const { t } = useTranslation()

  // Function to load children for a directory
  const loadChildren = useCallback(async (path: string): Promise<FileEntry[]> => {
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
  }, [spaceId])

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
          key={file.path}
          file={file}
          spaceId={spaceId}
          expandedDirs={expandedDirs}
          onToggleDir={onToggleDir}
          onFileClick={onFileClick}
          depth={depth}
          maxDepth={maxDepth}
          loadChildren={loadChildren}
        />
      ))}
    </div>
  )
}
