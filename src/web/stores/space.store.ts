/**
 * Space Store - Workspace state management
 */

import { create } from 'zustand'
import { api } from '../api'
import type { Space, CreateSpaceInput, SpacePreferences } from '../types'

interface SpaceState {
  // Spaces data
  haloSpace: Space | null
  spaces: Space[]
  currentSpace: Space | null
  currentSpaceId: string | null  // Persisted across reloads

  // Loading states
  isLoading: boolean
  error: string | null

  // Actions
  loadSpaces: () => Promise<void>
  loadHaloSpace: () => Promise<void>
  setCurrentSpace: (space: Space | null) => void
  createSpace: (input: CreateSpaceInput) => Promise<Space | null>
  updateSpace: (spaceId: string, updates: { name?: string; icon?: string }) => Promise<Space | null>
  deleteSpace: (spaceId: string) => Promise<boolean>
  openSpaceFolder: (spaceId: string) => Promise<void>
  refreshCurrentSpace: () => Promise<void>

  // Preferences actions
  updateSpacePreferences: (spaceId: string, preferences: Partial<SpacePreferences>) => Promise<void>
  getSpacePreferences: (spaceId: string) => SpacePreferences | undefined
}

// Try to restore currentSpaceId from localStorage on initial load
let persistedCurrentSpaceId = null
  try {
    if (typeof localStorage !== 'undefined') {
      persistedCurrentSpaceId = localStorage.getItem('hello_current_space_id')
    }
  } catch (e) {
    console.warn('[SpaceStore] Failed to get currentSpaceId from localStorage:', e)
  }

export const useSpaceStore = create<SpaceState>((set, get) => ({
  // Initial state
  helloSpace: null,
  spaces: [],
  currentSpace: null,
  currentSpaceId: persistedCurrentSpaceId,
  isLoading: false,
  error: null,

  // Load Hello temp space
  loadHelloSpace: async () => {
    try {
      const response = await api.getHaloSpace()
      console.log('[SpaceStore] getHaloSpace: success=%s id=%s', response.success, (response.data as Space)?.id)

      if (response.success && response.data) {
        const loadedHelloSpace = response.data as Space
        set({ helloSpace: loadedHelloSpace })

        // Restore currentSpace from persisted currentSpaceId if it matches helloSpace
        const { currentSpaceId } = get()
        if (currentSpaceId && loadedHelloSpace.id === currentSpaceId) {
          set({ currentSpace: loadedHelloSpace })
          console.log('[SpaceStore] Restored currentSpace to helloSpace:', currentSpaceId)
        }
      }
    } catch (error) {
      console.error('[SpaceStore] Failed to load Hello space:', error)
    }
  },

  // Load all spaces
  loadSpaces: async () => {
    try {
      set({ isLoading: true, error: null })

      // Load both Hello space and user spaces
      await get().loadHelloSpace()

      const response = await api.listSpaces()
      console.log('[SpaceStore] listSpaces: success=%s count=%d', response.success, Array.isArray(response.data) ? (response.data as Space[]).length : 0)

      if (response.success && response.data) {
        const loadedSpaces = response.data as Space[]
        set({ spaces: loadedSpaces })

        // Restore currentSpace from persisted currentSpaceId
        const { currentSpaceId, helloSpace } = get()
        if (currentSpaceId) {
          // Check if currentSpaceId matches a loaded space
          const restoredSpace = loadedSpaces.find(s => s.id === currentSpaceId)
          if (restoredSpace) {
            set({ currentSpace: restoredSpace })
            console.log('[SpaceStore] Restored currentSpace from localStorage:', currentSpaceId)
          }
        }
        // Also check if currentSpace should be helloSpace
        if (!get().currentSpace && helloSpace?.id === currentSpaceId) {
          set({ currentSpace: helloSpace })
          console.log('[SpaceStore] Restored currentSpace to helloSpace:', currentSpaceId)
        }
      } else {
        set({ error: response.error || 'Failed to load spaces' })
      }
    } catch (error) {
      console.error('[SpaceStore] Failed to load spaces:', error)
      set({ error: 'Failed to load spaces' })
    } finally {
      set({ isLoading: false })
    }
  },

  // Set current space
  setCurrentSpace: (space) => {
    set({ currentSpace: space, currentSpaceId: space?.id || null })
    // Persist to localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        if (space?.id) {
          localStorage.setItem('hello_current_space_id', space.id)
        } else {
          localStorage.removeItem('hello_current_space_id')
        }
      }
    } catch (e) {
      console.warn('[SpaceStore] Failed to persist currentSpaceId to localStorage:', e)
    }
  },

  // Create new space
  createSpace: async (input) => {
    try {
      const response = await api.createSpace(input)

      if (response.success && response.data) {
        const newSpace = response.data as Space

        // Add to spaces list
        set((state) => ({
          spaces: [newSpace, ...state.spaces]
        }))

        return newSpace
      } else {
        set({ error: response.error || 'Failed to create space' })
        return null
      }
    } catch (error) {
      console.error('Failed to create space:', error)
      set({ error: 'Failed to create space' })
      return null
    }
  },

  // Update space name/icon
  updateSpace: async (spaceId, updates) => {
    try {
      const response = await api.updateSpace(spaceId, updates)

      if (response.success && response.data) {
        const updatedSpace = response.data as Space

        // Update in spaces list
        set((state) => ({
          spaces: state.spaces.map((s) =>
            s.id === spaceId ? updatedSpace : s
          )
        }))

        // Update current space if it's the one being edited
        const currentSpace = get().currentSpace
        if (currentSpace?.id === spaceId) {
          set({ currentSpace: updatedSpace })
        }

        return updatedSpace
      } else {
        set({ error: response.error || 'Failed to update space' })
        return null
      }
    } catch (error) {
      console.error('Failed to update space:', error)
      set({ error: 'Failed to update space' })
      return null
    }
  },

  // Delete space
  deleteSpace: async (spaceId) => {
    try {
      const response = await api.deleteSpace(spaceId)

      if (response.success) {
        // Remove from spaces list
        set((state) => ({
          spaces: state.spaces.filter((s) => s.id !== spaceId)
        }))

        // Clear current space if it was deleted
        const currentSpace = get().currentSpace
        if (currentSpace?.id === spaceId) {
          set({ currentSpace: null, currentSpaceId: null })
          // Clear from localStorage
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('hello_current_space_id')
            }
          } catch (e) {
            console.warn('[SpaceStore] Failed to clear currentSpaceId from localStorage:', e)
          }
        }

        return true
      }

      return false
    } catch (error) {
      console.error('Failed to delete space:', error)
      return false
    }
  },

  // Open space folder in file explorer
  openSpaceFolder: async (spaceId) => {
    try {
      await api.openSpaceFolder(spaceId)
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  },

  // Refresh current space data
  refreshCurrentSpace: async () => {
    const currentSpace = get().currentSpace

    if (!currentSpace) return

    try {
      const response = await api.getSpace(currentSpace.id)

      if (response.success && response.data) {
        set({ currentSpace: response.data as Space })

        // Also update in spaces list
        if (!currentSpace.isTemp) {
          set((state) => ({
            spaces: state.spaces.map((s) =>
              s.id === currentSpace.id ? (response.data as Space) : s
            )
          }))
        } else {
          set({ haloSpace: response.data as Space })
        }
      }
    } catch (error) {
      console.error('Failed to refresh space:', error)
    }
  },

  // Update space preferences (layout settings, etc.)
  updateSpacePreferences: async (spaceId, preferences) => {
    try {
      const response = await api.updateSpacePreferences(spaceId, preferences)

      if (response.success && response.data) {
        const updatedSpace = response.data as Space

        // Update in current space if it matches
        const currentSpace = get().currentSpace
        if (currentSpace?.id === spaceId) {
          set({ currentSpace: updatedSpace })
        }

        // Update in spaces list or halo space
        if (updatedSpace.isTemp) {
          set({ haloSpace: updatedSpace })
        } else {
          set((state) => ({
            spaces: state.spaces.map((s) =>
              s.id === spaceId ? updatedSpace : s
            )
          }))
        }
      }
    } catch (error) {
      console.error('Failed to update space preferences:', error)
    }
  },

  // Get space preferences from state (sync, for UI reads)
  getSpacePreferences: (spaceId) => {
    const { haloSpace, spaces, currentSpace } = get()

    // Check current space first (most likely case)
    if (currentSpace?.id === spaceId) {
      return currentSpace.preferences
    }

    // Check halo space
    if (haloSpace?.id === spaceId) {
      return haloSpace.preferences
    }

    // Search in spaces list
    const space = spaces.find(s => s.id === spaceId)
    return space?.preferences
  }
}))
