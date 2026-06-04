/**
 * App Store - Global application state
 */

import { create } from 'zustand'
import { api } from '../api'
import { getAuthToken } from '../api/transport'
import type { HaloConfig, AppView, McpServerStatus } from '../types'
import { hasAnyAISource } from '../types'

// Git Bash installation progress
interface GitBashInstallProgress {
  phase: 'idle' | 'downloading' | 'extracting' | 'configuring' | 'done' | 'error'
  progress: number
  message: string
  error?: string
}

// Try to restore view state from localStorage on initial load
let persistedView: 'home' | 'space' | null = null
let persistedCurrentSpaceId: string | null = null
try {
  if (typeof localStorage !== 'undefined') {
    persistedView = localStorage.getItem('halo_app_view') as 'home' | 'space' | null
    persistedCurrentSpaceId = localStorage.getItem('halo_current_space_id')
  }
} catch (e) {
  console.warn('[AppStore] Failed to restore view state from localStorage:', e)
}

interface AppState {
  // View state
  view: AppView
  previousView: AppView | null  // Track previous view for back navigation
  isLoading: boolean
  error: string | null

  // Config
  config: HaloConfig | null

  // MCP Status (cached from last conversation)
  mcpStatus: McpServerStatus[]
  mcpStatusTimestamp: number | null  // When status was last updated

  // Git Bash mock mode (Windows only)
  mockBashMode: boolean
  gitBashInstallProgress: GitBashInstallProgress
  gitBashCheckPending: boolean  // True when git-bash check was deferred due to IPC not ready

  // Actions
  setView: (view: AppView) => void
  goBack: () => void  // Navigate back to previous view
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setConfig: (config: HaloConfig) => void
  updateConfig: (updates: Partial<HaloConfig>) => void
  setMcpStatus: (status: McpServerStatus[], timestamp: number) => void

  // Git Bash actions
  setMockBashMode: (mode: boolean) => void
  startGitBashInstall: () => Promise<void>
  refreshGitBashStatus: () => Promise<void>
  completeDeferredGitBashCheck: () => Promise<void>

  // Initialization
  initialize: () => Promise<void>

  // Internal: persist and restore view state
  _persistView: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  view: 'splash',
  previousView: null,
  isLoading: true,
  error: null,
  config: null,
  mcpStatus: [],
  mcpStatusTimestamp: null,
  mockBashMode: false,
  gitBashInstallProgress: { phase: 'idle', progress: 0, message: '' },
  gitBashCheckPending: false,

  // Actions
  setView: (view) => {
    const currentView = get().view
    // Save current view as previous (except for splash and setup screens)
    if (currentView !== 'splash' && currentView !== 'setup') {
      set({ previousView: currentView, view })
    } else {
      set({ view })
    }
    // Persist view state to localStorage
    get()._persistView()
  },

  goBack: () => {
    const previousView = get().previousView
    // Go back to previous view, or default to home
    set({ view: previousView || 'home', previousView: null })
  },

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setConfig: (config) => set({ config }),

  updateConfig: (updates) => {
    const currentConfig = get().config
    if (currentConfig) {
      set({ config: { ...currentConfig, ...updates } })
    }
  },

  setMcpStatus: (status, timestamp) => {
    set({ mcpStatus: status, mcpStatusTimestamp: timestamp })
  },

  // Persist view state to localStorage
  _persistView: () => {
    try {
      const { view } = get()
      if (view === 'space' || view === 'home') {
        localStorage.setItem('halo_app_view', view)
      }
      // Note: currentSpaceId is persisted by space.store.ts automatically
    } catch (e) {
      console.warn('[AppStore] Failed to persist view state:', e)
    }
  },

  // Git Bash actions
  setMockBashMode: (mode) => set({ mockBashMode: mode }),

  startGitBashInstall: async () => {
    set({
      gitBashInstallProgress: { phase: 'downloading', progress: 0, message: 'Preparing download...' }
    })

    try {
      const result = await api.installGitBash((progressData) => {
        set({
          gitBashInstallProgress: {
            phase: progressData.phase as GitBashInstallProgress['phase'],
            progress: progressData.progress,
            message: progressData.message,
            error: progressData.error
          }
        })
      })

      if (result.success) {
        set({
          gitBashInstallProgress: { phase: 'done', progress: 100, message: 'Installation complete' }
        })
        // Refresh status after successful install
        await get().refreshGitBashStatus()
      } else {
        set({
          gitBashInstallProgress: {
            phase: 'error',
            progress: 0,
            message: 'Installation failed',
            error: result.error || 'Unknown error'
          }
        })
      }
    } catch (e) {
      set({
        gitBashInstallProgress: {
          phase: 'error',
          progress: 0,
          message: 'Installation failed',
          error: e instanceof Error ? e.message : String(e)
        }
      })
    }
  },

  refreshGitBashStatus: async () => {
    // In B/S mode, Git Bash is handled by server
    // Check platform from user agent
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isWindows = /Windows/.test(userAgent)
    if (!isWindows) return

    try {
      const status = await api.getGitBashStatus()
      if (status.success && status.data) {
        // No mockMode in B/S architecture
        set({ mockBashMode: false })
      }
    } catch (e) {
      console.error('[App] Failed to refresh Git Bash status:', e)
    }
  },

  // Complete a deferred Git Bash check after extended services become ready.
  // Called when bootstrap timeout fired before extended services registered IPC handlers,
  // causing the initial git-bash check to fail. Once extended-ready arrives, this
  // re-runs the check so Windows users without Git Bash still see the setup flow.
  completeDeferredGitBashCheck: async () => {
    if (!get().gitBashCheckPending) return
    // Check platform from user agent
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isWindows = /Windows/.test(userAgent)
    if (!isWindows) {
      set({ gitBashCheckPending: false })
      return
    }

    console.log('[Store] Completing deferred Git Bash check...')
    try {
      const gitBashStatus = await api.getGitBashStatus()
      console.log('[Store] Deferred Git Bash status response:', gitBashStatus)
      if (gitBashStatus.success && gitBashStatus.data) {
        const { found } = gitBashStatus.data

        // Git Bash genuinely not available — redirect to setup
        if (!found) {
          console.log('[Store] Deferred check: Git Bash not found, showing gitBashSetup')
          set({ view: 'gitBashSetup' })
        }
      }
    } catch (e) {
      console.warn('[Store] Deferred Git Bash check failed:', e)
    } finally {
      set({ gitBashCheckPending: false })
    }
  },

  // Initialize app
  initialize: async () => {
    console.log('[Store] initialize() called')
    try {
      set({ isLoading: true, error: null })

      // B/S Architecture: Check authentication first
      console.log('[Store] Checking authentication...')
      try {
        const authConfig = await api.getAuthConfig()
        if (authConfig.success && authConfig.data) {
          const mode = authConfig.data.mode

          // If auth is disabled or header mode, skip login and go to config check
          if (mode === 'disabled' || mode === 'header') {
            console.log('[Store] Auth disabled or header mode, skipping login')
          } else {
            // Check if user is authenticated
            const token = getAuthToken()
            if (!token) {
              console.log('[Store] No auth token, showing login')
              set({ view: 'login', isLoading: false })
              return
            }

            const userResult = await api.getCurrentUser()
            if (!userResult.success) {
              console.log('[Store] Not authenticated, showing login')
              set({ view: 'login', isLoading: false })
              return
            }
            console.log('[Store] User authenticated')
          }
        }
      } catch (authError) {
        // Auth check failed, show login
        console.warn('[Store] Auth check failed, showing login:', authError)
        set({ view: 'login', isLoading: false })
        return
      }

      // Windows: Check Git Bash availability first
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
      const isWindows = /Windows/.test(userAgent)
      if (isWindows) {
        console.log('[Store] Windows detected, checking Git Bash status...')
        try {
          const gitBashStatus = await api.getGitBashStatus()
          console.log('[Store] Git Bash status response:', gitBashStatus)
          if (gitBashStatus.success && gitBashStatus.data) {
            const { found } = gitBashStatus.data

            // If Git Bash not found, show setup
            if (!found) {
              console.log('[Store] Git Bash not found, showing setup')
              set({ view: 'gitBashSetup', isLoading: false })
              return
            }

            console.log('[Store] Git Bash found')
          }
        } catch (gitBashError) {
          console.warn('[Store] Git Bash check deferred (IPC not ready):', gitBashError)
          set({ gitBashCheckPending: true })
        }
      }

      // Load config from server
      console.log('[Store] Loading config...')
      const response = await api.getConfig()
      console.log('[Store] Config response:', response.success ? 'success' : 'failed')

      if (response.success && response.data) {
        const config = response.data as HaloConfig

        set({ config })

        // Check if we should restore previous view (page refresh scenario)
        // Only restore if not first launch and has AI source configured
        if (!config.isFirstLaunch && hasAnyAISource(config.aiSources)) {
          // Try to restore previous view state from localStorage
          try {
            const restoredView = localStorage.getItem('halo_app_view') as AppView | null
            const restoredSpaceId = localStorage.getItem('halo_current_space_id')

            if (restoredView === 'space' && restoredSpaceId) {
              // Restore space view - SpacePage will handle loading the space
              console.log('[Store] Restoring previous space view:', restoredSpaceId)
              set({ view: 'space' })
              // Note: space store will restore currentSpace from localStorage automatically
              return
            }
          } catch (e) {
            console.warn('[Store] Failed to restore view state:', e)
          }
        }

        // Determine initial view based on config
        // Show setup if first launch or no AI source configured
        if (config.isFirstLaunch || !hasAnyAISource(config.aiSources)) {
          console.log('[Store] First launch or no AI source, showing setup')
          set({ view: 'setup' })
        } else {
          // Go to home
          console.log('[Store] Config loaded, showing home')
          set({ view: 'home' })
        }
      } else {
        console.error('[Store] Failed to load config:', response.error)
        set({ error: response.error || 'Failed to load configuration' })
        set({ view: 'setup' })
      }
    } catch (error) {
      console.error('[Store] Failed to initialize:', error)
      set({ error: 'Failed to initialize application' })
      set({ view: 'setup' })
    } finally {
      set({ isLoading: false })
      console.log('[Store] initialize() completed')
    }
  }
}))
