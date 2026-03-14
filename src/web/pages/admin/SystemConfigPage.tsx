/**
 * System Configuration Page
 */

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { adminApi } from '../../api/client'

export const SystemConfigPage: React.FC = () => {
  const { t } = useTranslation()
  const [config, setConfig] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      setLoading(true)
      const response = await adminApi.getConfig()
      setConfig(response.data.data)
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || t('Failed to load config'))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await adminApi.updateConfig(config)
      setMessage(t('Configuration saved successfully'))
    } catch (err: any) {
      setMessage(err.response?.data?.error?.message || t('Failed to save config'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">{t('Loading...')}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          {t('System Configuration')}
        </h1>

        {message && (
          <div className={`mb-4 p-4 rounded ${
            message.includes('success')
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="space-y-6">
            {/* AI Provider Section */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {t('Default AI Provider')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('Provider')}
                  </label>
                  <select
                    value={config?.aiProvider?.provider || 'anthropic'}
                    onChange={(e) => setConfig({
                      ...config,
                      aiProvider: { ...config?.aiProvider, provider: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                  >
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('Model')}
                  </label>
                  <input
                    type="text"
                    value={config?.aiProvider?.model || ''}
                    onChange={(e) => setConfig({
                      ...config,
                      aiProvider: { ...config?.aiProvider, model: e.target.value }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 dark:text-white"
                    placeholder="claude-3-sonnet-20240229"
                  />
                </div>
              </div>
            </div>

            {/* Features Section */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                {t('Features')}
              </h2>
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="enableSignups"
                    checked={config?.features?.enableSignups ?? true}
                    onChange={(e) => setConfig({
                      ...config,
                      features: { ...config?.features, enableSignups: e.target.checked }
                    })}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="enableSignups" className="ml-2 block text-sm text-gray-900 dark:text-white">
                    {t('Enable user signups')}
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="lockAiConfig"
                    checked={config?.features?.lockAiConfig ?? false}
                    onChange={(e) => setConfig({
                      ...config,
                      features: { ...config?.features, lockAiConfig: e.target.checked }
                    })}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                  <label htmlFor="lockAiConfig" className="ml-2 block text-sm text-gray-900 dark:text-white">
                    {t('Lock AI provider configuration for users')}
                  </label>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? t('Saving...') : t('Save Configuration')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
