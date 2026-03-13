/**
 * 登录页面 - B/S 架构用户认证
 */

import { useState, useEffect } from 'react'
import { useTranslation } from '../i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app.store'

export function LoginPage() {
  const { t } = useTranslation()
  const { setView } = useAppStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [authMode, setAuthMode] = useState<string>('normal')

  // 获取认证模式
  useEffect(() => {
    const fetchAuthMode = async () => {
      try {
        const result = await api.getAuthConfig()
        if (result.success && result.data) {
          const mode = result.data.mode

          // 如果认证被禁用，直接跳转到首页
          if (mode === 'disabled') {
            setView('home')
            return
          }

          setAuthMode(mode)
        }
      } catch (err) {
        console.error('Failed to fetch auth mode:', err)
      }
    }

    fetchAuthMode()
  }, [setView])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await api.login(username, password)

      if (result.success && result.data) {
        // 连接到 WebSocket
        api.connectWebSocket()

        // 重新初始化应用
        const { initialize } = useAppStore.getState()
        await initialize()
      } else {
        setError(result.error || t('Login failed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Login failed'))
    } finally {
      setLoading(false)
    }
  }

  // 如果认证被禁用，显示加载中
  if (authMode === 'disabled') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{t('Loading...')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card rounded-lg shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">{t('Halo')}</h1>
          <p className="text-muted-foreground mt-2">{t('Please login to continue')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
              {t('Username')}
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t('Enter username')}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
              {t('Password')}
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t('Enter password')}
              required
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t('Logging in...') : t('Login')}
          </button>
        </form>

        {authMode === 'simple' && (
          <p className="text-xs text-muted-foreground text-center">
            {t('Simple Token mode - Contact administrator for token')}
          </p>
        )}

        {authMode === 'header' && (
          <p className="text-xs text-muted-foreground text-center">
            {t('Header auth mode - User identity from request header')}
          </p>
        )}
      </div>
    </div>
  )
}
