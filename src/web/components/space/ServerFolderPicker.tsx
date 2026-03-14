/**
 * ServerFolderPicker - Server-side folder browser dialog for B/S mode
 *
 * Replaces Electron's native folder dialog in web mode.
 * Browses the server's filesystem via REST API.
 */

import { useState, useEffect, useRef } from 'react'
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  Home,
  HardDrive,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  X
} from 'lucide-react'
import { api } from '../../api'
import { useTranslation } from '../../i18n'

interface ServerFolderPickerProps {
  onSelect: (path: string) => void
  onCancel: () => void
}

interface DirEntry {
  name: string
  path: string
}

interface RootEntry {
  path: string
  name: string
}

export function ServerFolderPicker({ onSelect, onCancel }: ServerFolderPickerProps) {
  const { t } = useTranslation()

  const [roots, setRoots] = useState<RootEntry[]>([])
  const [dirs, setDirs] = useState<DirEntry[]>([])
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [separator, setSeparator] = useState<string>('/')
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [isAtRoot, setIsAtRoot] = useState(true)
  const [isCreatingDir, setIsCreatingDir] = useState(false)
  const [newDirName, setNewDirName] = useState('')
  const [newDirError, setNewDirError] = useState<string | null>(null)
  const [newDirLoading, setNewDirLoading] = useState(false)

  const pathInputRef = useRef<HTMLInputElement>(null)
  const newDirInputRef = useRef<HTMLInputElement>(null)

  // Load roots on mount
  useEffect(() => {
    loadRoots()
  }, [])

  const loadRoots = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.getFilesystemRoots()
      if (res.success && res.data) {
        setRoots(res.data as RootEntry[])
        setIsAtRoot(true)
        setCurrentPath(null)
        setDirs([])
        setSelectedPath(null)
      } else {
        setError(res.error || t('Failed to load filesystem roots'))
      }
    } catch {
      setError(t('Failed to connect to server'))
    } finally {
      setLoading(false)
    }
  }

  const browsePath = async (path: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.browseFilesystem(path, showHidden)
      if (res.success && res.data) {
        const data = res.data as {
          path: string
          separator: string
          dirs: DirEntry[]
          truncated: boolean
        }
        setCurrentPath(data.path)
        setSeparator(data.separator)
        setDirs(data.dirs)
        setTruncated(data.truncated)
        setIsAtRoot(false)
        setSelectedPath(data.path)
        setPathInput(data.path)
      } else {
        setError(res.error || t('Failed to browse directory'))
      }
    } catch {
      setError(t('Failed to connect to server'))
    } finally {
      setLoading(false)
    }
  }

  // Re-browse when showHidden changes (if we're in a directory)
  useEffect(() => {
    if (currentPath) {
      browsePath(currentPath)
    }
  }, [showHidden])

  const handleRootClick = (root: RootEntry) => {
    browsePath(root.path)
  }

  const handleDirClick = (dir: DirEntry) => {
    browsePath(dir.path)
  }

  const handleDirSelect = (dir: DirEntry) => {
    setSelectedPath(dir.path)
  }

  const handlePathInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && pathInput.trim()) {
      browsePath(pathInput.trim())
    }
  }

  const handleGoToRoot = () => {
    loadRoots()
  }

  const handleStartCreateDir = () => {
    setIsCreatingDir(true)
    setNewDirName('')
    setNewDirError(null)
    setTimeout(() => newDirInputRef.current?.focus(), 50)
  }

  const handleCancelCreateDir = () => {
    setIsCreatingDir(false)
    setNewDirName('')
    setNewDirError(null)
  }

  const handleCreateDir = async () => {
    if (!newDirName.trim() || !currentPath) return

    setNewDirLoading(true)
    setNewDirError(null)
    try {
      const newPath = currentPath + separator + newDirName.trim()
      const res = await api.createDirectory(newPath)
      if (res.success && res.data) {
        const createdPath = (res.data as { path: string }).path
        setIsCreatingDir(false)
        setNewDirName('')
        // Refresh current directory and select the new folder
        await browsePath(currentPath)
        setSelectedPath(createdPath)
      } else {
        const errorStr = typeof res.error === 'string' ? res.error : ''
        if (errorStr.includes('DIR_ALREADY_EXISTS') || errorStr.includes('already exists')) {
          setNewDirError(t('Folder already exists'))
        } else if (errorStr.includes('PERMISSION_DENIED') || errorStr.includes('permission')) {
          setNewDirError(t('No write permission'))
        } else {
          setNewDirError(errorStr || t('Failed to create folder'))
        }
      }
    } catch {
      setNewDirError(t('Failed to connect to server'))
    } finally {
      setNewDirLoading(false)
    }
  }

  const handleNewDirKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateDir()
    } else if (e.key === 'Escape') {
      handleCancelCreateDir()
    }
  }

  // Parse current path into breadcrumb segments
  const getBreadcrumbs = (): Array<{ label: string; path: string }> => {
    if (!currentPath) return []

    const parts = currentPath.split(separator).filter(Boolean)
    const crumbs: Array<{ label: string; path: string }> = []

    // Handle Windows drive letters (e.g., "C:")
    if (separator === '\\' && parts.length > 0 && parts[0].endsWith(':')) {
      let accumulated = parts[0] + separator
      crumbs.push({ label: parts[0] + separator, path: accumulated })
      for (let i = 1; i < parts.length; i++) {
        accumulated = accumulated + parts[i] + (i < parts.length - 1 ? separator : '')
        crumbs.push({ label: parts[i], path: accumulated })
      }
    } else {
      // Unix paths
      for (let i = 0; i < parts.length; i++) {
        const path = separator + parts.slice(0, i + 1).join(separator)
        crumbs.push({ label: parts[i], path })
      }
    }

    return crumbs
  }

  const handleConfirm = () => {
    if (selectedPath) {
      onSelect(selectedPath)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg animate-fade-in flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="p-4 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-medium">{t('Select Folder')}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Browse server filesystem to select a folder')}
          </p>
        </div>

        {/* Path input */}
        <div className="px-4 pt-3 flex-shrink-0">
          <div className="flex gap-2">
            <input
              ref={pathInputRef}
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onKeyDown={handlePathInputKeyDown}
              placeholder={t('Enter path and press Enter')}
              className="flex-1 px-3 py-1.5 text-sm bg-input rounded-lg border border-border focus:border-primary focus:outline-none transition-colors"
            />
            <button
              onClick={handleGoToRoot}
              className="px-2 py-1.5 text-sm bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
              title={t('Go to root')}
            >
              <HardDrive className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Breadcrumb navigation */}
        {!isAtRoot && currentPath && (
          <div className="px-4 pt-2 flex-shrink-0">
            <div className="flex items-center gap-0.5 text-xs text-muted-foreground overflow-x-auto">
              <button
                onClick={handleGoToRoot}
                className="hover:text-foreground transition-colors flex-shrink-0 p-0.5"
              >
                <Home className="w-3.5 h-3.5" />
              </button>
              {getBreadcrumbs().map((crumb, i) => (
                <span key={crumb.path} className="flex items-center gap-0.5 flex-shrink-0">
                  <ChevronRight className="w-3 h-3" />
                  <button
                    onClick={() => browsePath(crumb.path)}
                    className="hover:text-foreground transition-colors px-0.5 py-0.5 rounded hover:bg-secondary"
                  >
                    {crumb.label}
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Directory list */}
        <div className="flex-1 overflow-auto px-4 py-2 min-h-0" style={{ maxHeight: '400px' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">{t('Loading...')}</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 py-4 px-3 bg-destructive/10 rounded-lg">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              <span className="text-sm text-destructive">{error}</span>
            </div>
          ) : isAtRoot ? (
            /* Root entries */
            <div className="space-y-1">
              {roots.map((root) => (
                <button
                  key={root.path}
                  onClick={() => handleRootClick(root)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary transition-colors text-left"
                >
                  {root.name === 'Home' ? (
                    <Home className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <HardDrive className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{root.name}</div>
                    {root.name === 'Home' && (
                      <div className="text-xs text-muted-foreground truncate">{root.path}</div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>
          ) : (
            /* Directory entries */
            <div className="space-y-0.5">
              {/* New folder button / inline input */}
              {!isAtRoot && (
                isCreatingDir ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5">
                    <FolderPlus className="w-4 h-4 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <input
                        ref={newDirInputRef}
                        type="text"
                        value={newDirName}
                        onChange={(e) => { setNewDirName(e.target.value); setNewDirError(null) }}
                        onKeyDown={handleNewDirKeyDown}
                        placeholder={t('Folder name')}
                        disabled={newDirLoading}
                        className="w-full text-sm bg-transparent border-none focus:outline-none placeholder:text-muted-foreground/50"
                      />
                      {newDirError && (
                        <div className="text-xs text-destructive mt-0.5">{newDirError}</div>
                      )}
                    </div>
                    {newDirLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                    ) : (
                      <button
                        onClick={handleCancelCreateDir}
                        className="p-0.5 hover:bg-secondary rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleStartCreateDir}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-secondary border border-dashed border-border transition-colors text-left text-muted-foreground hover:text-foreground"
                  >
                    <FolderPlus className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm">{t('New Folder')}</span>
                  </button>
                )
              )}

              {dirs.length === 0 && !isCreatingDir ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Folder className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{t('No subdirectories')}</p>
                </div>
              ) : (
                <>
                  {dirs.map((dir) => (
                    <button
                      key={dir.path}
                      onClick={() => handleDirSelect(dir)}
                      onDoubleClick={() => handleDirClick(dir)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition-colors text-left ${
                        selectedPath === dir.path
                          ? 'bg-primary/10 border border-primary/30'
                          : 'hover:bg-secondary border border-transparent'
                      }`}
                    >
                      {selectedPath === dir.path ? (
                        <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
                      ) : (
                        <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="text-sm truncate flex-1">{dir.name}</span>
                      <ChevronRight
                        className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDirClick(dir)
                        }}
                      />
                    </button>
                  ))}
                  {truncated && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      {t('Too many directories, showing first 500. Use path input for deeper navigation.')}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex-shrink-0">
          {/* Selected path display + hidden toggle */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex-1 min-w-0 mr-3">
              {selectedPath && !isAtRoot ? (
                <div className="text-xs text-muted-foreground truncate" title={selectedPath}>
                  {t('Selected')}: {selectedPath}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {isAtRoot ? t('Select a drive or location') : t('Select a folder or double-click to enter')}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowHidden(!showHidden)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title={showHidden ? t('Hide hidden folders') : t('Show hidden folders')}
            >
              {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showHidden ? t('Hidden: On') : t('Hidden: Off')}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-muted-foreground hover:bg-secondary rounded-lg transition-colors"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedPath || isAtRoot}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('Select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
