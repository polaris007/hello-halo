/**
 * BrowserViewer - Stub for B/S architecture
 * AI Browser functionality has been removed in the B/S architecture migration
 * This component provides a fallback UI for browser/PDF tabs
 */

import { Globe, FileText } from 'lucide-react'
import type { TabState } from '../../../services/canvas-lifecycle'
import { useTranslation } from '../../../i18n'

interface BrowserViewerProps {
  tab: TabState
}

export function BrowserViewer({ tab }: BrowserViewerProps) {
  const { t } = useTranslation()
  const isPdf = tab.type === 'pdf'

  return (
    <div className="flex items-center justify-center h-full bg-muted/30">
      <div className="flex flex-col items-center gap-4 text-center max-w-md px-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          {isPdf ? (
            <FileText className="w-8 h-8 text-primary" />
          ) : (
            <Globe className="w-8 h-8 text-primary" />
          )}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2">
            {isPdf ? t('PDF Viewer') : t('Browser')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isPdf
              ? t('PDF viewing is not available in web mode')
              : t('Browser functionality is not available in web mode')}
          </p>
          {tab.url && (
            <p className="text-xs text-muted-foreground mt-2 break-all">
              {tab.url}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export function BrowserViewerFallback({ tab }: BrowserViewerProps) {
  // Same as BrowserViewer - both show the fallback message
  return BrowserViewer({ tab })
}
