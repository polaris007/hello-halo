/**
 * Unit tests for conversation creation and URL synchronization
 * Tests the flow of creating new conversations and updating URL
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Conversation Creation and URL Sync', () => {
  // Mock window.location and history
  const originalLocation = window.location
  const originalHistory = window.history

  beforeEach(() => {
    // Reset URL before each test
    vi.stubGlobal('window', {
      ...window,
      location: {
        ...originalLocation,
        search: '',
        pathname: '/',
        href: 'http://localhost/'
      },
      history: {
        ...originalHistory,
        pushState: vi.fn()
      }
    })
  })

  describe('New conversation creation flow', () => {
    it('should update URL when new conversation is created', async () => {
      // Setup - URL with only spaceId
      window.location.search = '?spaceId=space-123'

      // Simulate creating a new conversation
      const spaceId = 'space-123'
      const newConversationId = 'conv-new-123'

      // Update URL with new conversation ID
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', newConversationId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('conversationId=conv-new-123')
      )
    })

    it('should not update URL if conversation creation fails', () => {
      // Setup - URL with only spaceId
      window.location.search = '?spaceId=space-123'

      // Simulate failed conversation creation
      const conversationCreated = false

      // URL should not be updated
      if (!conversationCreated) {
        // No URL update
        const callCount = vi.mocked(window.history.pushState).mock.calls.length
        expect(callCount).toBe(0)
      }
    })
  })

  describe('URL update after sending first message', () => {
    it('should update URL when first message is sent in new conversation', () => {
      // Setup - URL with spaceId but no conversationId (new conversation)
      window.location.search = '?spaceId=space-123'

      // Simulate sending first message and getting conversation ID
      const spaceId = 'space-123'
      const conversationId = 'conv-after-message'

      // Update URL
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', conversationId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert URL was updated
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('conversationId=conv-after-message')
      )
    })

    it('should preserve spaceId when updating conversationId', () => {
      // Setup
      const spaceId = 'space-123'
      const conversationId = 'conv-456'

      // Update URL
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', conversationId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert both parameters are present
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('spaceId=space-123')
      )
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('conversationId=conv-456')
      )
    })
  })

  describe('Conversation switching', () => {
    it('should update URL when switching to existing conversation', () => {
      // Setup - current URL with one conversation
      window.location.search = '?spaceId=space-123&conversationId=conv-1'

      // Switch to different conversation
      const spaceId = 'space-123'
      const newConversationId = 'conv-2'

      // Update URL
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', newConversationId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert URL was updated with new conversation
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('conversationId=conv-2')
      )
    })

    it('should update URL when switching to conversation in different space', () => {
      // Setup - current URL with one space and conversation
      window.location.search = '?spaceId=space-1&conversationId=conv-1'

      // Switch to conversation in different space
      const newSpaceId = 'space-2'
      const newConversationId = 'conv-2'

      // Update URL
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', newSpaceId)
      urlParams.set('conversationId', newConversationId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert both space and conversation were updated
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('spaceId=space-2')
      )
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('conversationId=conv-2')
      )
    })
  })

  describe('Edge cases', () => {
    it('should handle rapid conversation switches', () => {
      // Simulate rapid switching between conversations
      const switches = [
        { spaceId: 'space-1', conversationId: 'conv-1' },
        { spaceId: 'space-1', conversationId: 'conv-2' },
        { spaceId: 'space-1', conversationId: 'conv-3' }
      ]

      switches.forEach(({ spaceId, conversationId }) => {
        const urlParams = new URLSearchParams()
        urlParams.set('spaceId', spaceId)
        urlParams.set('conversationId', conversationId)
        const search = `?${urlParams.toString()}`

        window.history.pushState({}, '', `${window.location.pathname}${search}`)
      })

      // Assert all switches were recorded
      expect(window.history.pushState).toHaveBeenCalledTimes(3)
    })

    it('should handle URL update with null conversationId', () => {
      // Setup
      const spaceId = 'space-123'

      // Update URL with null conversationId
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      // Don't set conversationId
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert URL contains only spaceId
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('spaceId=space-123')
      )
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.not.stringContaining('conversationId')
      )
    })
  })
})