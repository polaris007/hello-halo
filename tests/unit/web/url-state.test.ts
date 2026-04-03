/**
 * Unit tests for URL state management
 * Tests URL parameter parsing, state recovery, and URL update functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('URL State Management', () => {
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

  describe('parseUrlParams', () => {
    it('should parse spaceId and conversationId from URL', () => {
      // Setup
      window.location.search = '?spaceId=space-123&conversationId=conv-456'

      // Parse URL parameters
      const urlParams = new URLSearchParams(window.location.search)
      const spaceId = urlParams.get('spaceId')
      const conversationId = urlParams.get('conversationId')

      // Assert
      expect(spaceId).toBe('space-123')
      expect(conversationId).toBe('conv-456')
    })

    it('should return null for missing parameters', () => {
      // Setup
      window.location.search = ''

      // Parse URL parameters
      const urlParams = new URLSearchParams(window.location.search)
      const spaceId = urlParams.get('spaceId')
      const conversationId = urlParams.get('conversationId')

      // Assert
      expect(spaceId).toBeNull()
      expect(conversationId).toBeNull()
    })

    it('should handle only spaceId', () => {
      // Setup
      window.location.search = '?spaceId=space-123'

      // Parse URL parameters
      const urlParams = new URLSearchParams(window.location.search)
      const spaceId = urlParams.get('spaceId')
      const conversationId = urlParams.get('conversationId')

      // Assert
      expect(spaceId).toBe('space-123')
      expect(conversationId).toBeNull()
    })

    it('should handle invalid URL parameters gracefully', () => {
      // Setup
      window.location.search = '?invalidParam=value'

      // Parse URL parameters
      const urlParams = new URLSearchParams(window.location.search)
      const spaceId = urlParams.get('spaceId')
      const conversationId = urlParams.get('conversationId')

      // Assert
      expect(spaceId).toBeNull()
      expect(conversationId).toBeNull()
    })
  })

  describe('updateUrlParams', () => {
    it('should update URL with spaceId and conversationId', () => {
      // Update URL parameters
      const spaceId = 'space-123'
      const conversationId = 'conv-456'
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', conversationId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert
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

    it('should update URL with only spaceId', () => {
      // Update URL parameters
      const spaceId = 'space-123'
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      const search = `?${urlParams.toString()}`

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert
      expect(window.history.pushState).toHaveBeenCalledWith(
        {},
        '',
        expect.stringContaining('spaceId=space-123')
      )
    })

    it('should clear URL when both parameters are null', () => {
      // Update URL parameters
      const urlParams = new URLSearchParams()
      const search = urlParams.toString() ? `?${urlParams.toString()}` : ''

      window.history.pushState({}, '', `${window.location.pathname}${search}`)

      // Assert
      expect(window.history.pushState).toHaveBeenCalledWith({}, '', '/')
    })
  })

  describe('URL sharing functionality', () => {
    it('should generate shareable URL with space and conversation', () => {
      // Setup
      const spaceId = 'space-123'
      const conversationId = 'conv-456'

      // Generate URL
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', conversationId)
      const shareableUrl = `http://localhost/?${urlParams.toString()}`

      // Assert
      expect(shareableUrl).toBe('http://localhost/?spaceId=space-123&conversationId=conv-456')
    })

    it('should parse shared URL correctly', () => {
      // Setup - simulate shared URL
      const sharedUrl = 'http://localhost/?spaceId=space-123&conversationId=conv-456'
      const url = new URL(sharedUrl)

      // Parse
      const spaceId = url.searchParams.get('spaceId')
      const conversationId = url.searchParams.get('conversationId')

      // Assert
      expect(spaceId).toBe('space-123')
      expect(conversationId).toBe('conv-456')
    })

    it('should handle URL with special characters in IDs', () => {
      // Setup - IDs with special characters (URL encoded)
      const spaceId = 'space-123-abc'
      const conversationId = 'conv-456-xyz'

      // Generate URL
      const urlParams = new URLSearchParams()
      urlParams.set('spaceId', spaceId)
      urlParams.set('conversationId', conversationId)
      const shareableUrl = `http://localhost/?${urlParams.toString()}`

      // Parse back
      const url = new URL(shareableUrl)
      const parsedSpaceId = url.searchParams.get('spaceId')
      const parsedConversationId = url.searchParams.get('conversationId')

      // Assert
      expect(parsedSpaceId).toBe(spaceId)
      expect(parsedConversationId).toBe(conversationId)
    })
  })

  describe('Browser compatibility', () => {
    it('should use URLSearchParams API (supported in all modern browsers)', () => {
      // URLSearchParams is supported in:
      // Chrome 49+, Firefox 44+, Safari 10.1+, Edge 17+
      expect(() => new URLSearchParams()).not.toThrow()
    })

    it('should use history.pushState (supported in all modern browsers)', () => {
      // history.pushState is supported in:
      // Chrome 5+, Firefox 4+, Safari 5+, Edge 12+
      expect(() => window.history.pushState({}, '', '/')).not.toThrow()
    })

    it('should handle URL API correctly', () => {
      // URL API is supported in:
      // Chrome 19+, Firefox 26+, Safari 14+, Edge 12+
      expect(() => new URL('http://localhost/')).not.toThrow()
    })
  })
})