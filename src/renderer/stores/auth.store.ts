/**
 * 认证状态管理 Store
 */

import { create } from 'zustand'
import { getAuthToken, setAuthToken, clearAuthToken } from '../api/transport'
import { api } from '../api'

interface AuthState {
  isAuthenticated: boolean
  user: {
    id: string
    username: string
  } | null
  isLoading: boolean
  error: string | null
  authMode: string | null

  // Actions
  initialize: () => Promise<void>
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkAuth: () => Promise<boolean>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: !!getAuthToken(),
  user: null,
  isLoading: false,
  error: null,
  authMode: null,

  initialize: async () => {
    set({ isLoading: true })

    try {
      // 获取认证模式
      const configResult = await api.getAuthConfig()
      if (configResult.success) {
        set({ authMode: configResult.data?.mode || 'normal' })

        // 如果认证被禁用，标记为已认证
        if (configResult.data?.mode === 'disabled') {
          set({ isAuthenticated: true, isLoading: false })
          return
        }
      }

      // 检查是否有 Token
      const token = getAuthToken()
      if (token) {
        const userResult = await api.getCurrentUser()
        if (userResult.success && userResult.data) {
          set({
            isAuthenticated: true,
            user: userResult.data,
            isLoading: false
          })

          // 连接到 WebSocket
          api.connectWebSocket()
          return
        }
      }

      // 未认证
      set({ isAuthenticated: false, isLoading: false })
    } catch (error) {
      console.error('Auth initialize error:', error)
      set({
        isAuthenticated: false,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Authentication failed'
      })
    }
  },

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null })

    try {
      const result = await api.login(username, password)

      if (result.success && result.data) {
        set({
          isAuthenticated: true,
          user: result.data.user,
          isLoading: false
        })
        return { success: true }
      } else {
        set({
          isLoading: false,
          error: result.error || 'Login failed'
        })
        return { success: false, error: result.error }
      }
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed'
      })
      return { success: false, error: error instanceof Error ? error.message : 'Login failed' }
    }
  },

  logout: async () => {
    try {
      await api.logout()
    } catch (error) {
      console.error('Logout error:', error)
    }

    clearAuthToken()
    api.disconnectWebSocket()

    set({
      isAuthenticated: false,
      user: null,
      error: null
    })
  },

  checkAuth: async () => {
    const token = getAuthToken()
    if (!token) {
      return false
    }

    try {
      const result = await api.getCurrentUser()
      return result.success
    } catch {
      return false
    }
  },

  clearError: () => {
    set({ error: null })
  }
}))
