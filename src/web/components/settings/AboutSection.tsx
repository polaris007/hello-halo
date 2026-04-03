/**
 * About Section Component
 * Displays version info
 */

import { useState, useEffect } from 'react'
import { useTranslation } from '../../i18n'
import { api } from '../../api'

declare const __BUILD_TIME__: string

export function AboutSection() {
  const { t } = useTranslation()

  const [appVersion, setAppVersion] = useState<string>('')

  useEffect(() => {
    api.getVersion().then((result) => {
      if (result.success && result.data) {
        setAppVersion(result.data)
      }
    })
  }, [])

  return (
    <section id="about" className="bg-card rounded-xl border border-border p-6">
      <h2 className="text-lg font-medium mb-4">{t('About')}</h2>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">{t('Version')}</span>
          <span>{appVersion ? `${appVersion} (${__BUILD_TIME__.replace(/T(\d{2}):(\d{2}).*/, '-$1$2')})` : '-'}</span>
        </div>
      </div>
    </section>
  )
}
