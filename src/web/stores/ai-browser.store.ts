/**
 * AI Browser Store - Stub for B/S architecture
 * AI Browser functionality has been removed in the B/S architecture migration
 * This store provides a minimal interface for backward compatibility
 */

import { create } from 'zustand'

interface AIBrowserState {
  enabled: boolean
  setEnabled: (_enabled: boolean) => void
}

export const useAIBrowserStore = create<AIBrowserState>((set) => ({
  // AI Browser is always disabled in B/S architecture
  enabled: false,
  setEnabled: (_enabled: boolean) => {
    // No-op: AI Browser is not available in B/S architecture
    console.warn('AI Browser is not available in web mode')
  },
}))
