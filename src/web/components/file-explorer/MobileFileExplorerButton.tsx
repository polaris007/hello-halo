/**
 * MobileFileExplorerButton - Floating button for FileExplorer on mobile
 *
 * Shows a floating action button on mobile that opens a bottom sheet
 * containing the FileExplorer component.
 */

import { useState, useCallback } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { FileExplorer } from './FileExplorer'
import { useTranslation } from '../../i18n'

interface MobileFileExplorerButtonProps {
  spaceId: string
}

export function MobileFileExplorerButton({ spaceId }: MobileFileExplorerButtonProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const handleOpen = useCallback(() => {
    setIsOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsAnimatingOut(true)
    setTimeout(() => {
      setIsOpen(false)
      setIsAnimatingOut(false)
    }, 200)
  }, [])

  return (
    <>
      {/* Floating action button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-4 right-4 z-30 p-3 bg-primary text-primary-foreground rounded-full shadow-lg hover:bg-primary/90 transition-colors"
        title={t('Browse files')}
      >
        <FolderOpen size={20} />
      </button>

      {/* Bottom sheet */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={handleClose}
            className={`fixed inset-0 bg-black/40 z-40 ${isAnimatingOut ? 'animate-fade-out' : 'animate-fade-in'}`}
            style={{ animationDuration: '0.2s' }}
          />

          {/* Bottom sheet container */}
          <div
            className={`
              fixed inset-x-0 bottom-0 z-50
              bg-card rounded-t-2xl border-t border-border/50
              shadow-2xl overflow-hidden
              ${isAnimatingOut ? 'animate-slide-out-bottom' : 'animate-slide-in-bottom'}
            `}
            style={{ maxHeight: '70vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen size={16} className="text-muted-foreground" />
                <h3 className="text-base font-semibold text-foreground">{t('Files')}</h3>
              </div>
              <button
                onClick={handleClose}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* FileExplorer content */}
            <div className="h-[calc(70vh-60px)] overflow-hidden">
              <FileExplorer spaceId={spaceId} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
