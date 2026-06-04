/**
 * Transport Layer - HTTP/WebSocket communication for B/S architecture
 */

// Get the server URL
export function getServerUrl(): string {
  // In B/S mode, use the current origin
  return window.location.origin
}

// Get stored auth token
export function getAuthToken(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('halo_remote_token')
  }
  return null
}

// Get stored refresh token
export function getRefreshToken(): string | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('halo_refresh_token')
  }
  return null
}

// Set auth tokens
export function setAuthToken(accessToken: string, refreshToken: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('halo_remote_token', accessToken)
    localStorage.setItem('halo_refresh_token', refreshToken)
  }
}

// Clear auth tokens
export function clearAuthToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('halo_remote_token')
    localStorage.removeItem('halo_refresh_token')
    localStorage.removeItem('halo_token_expires_at')
  }
}

// Token refresh state
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

// Add request to queue while refreshing
function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback)
}

// Process all queued requests after refresh
function onRefreshed(token: string) {
  refreshSubscribers.forEach(callback => callback(token))
  refreshSubscribers = []
}

// Request caching and deduping
interface RequestCacheItem<T> {
  promise: Promise<{ success: boolean; data?: T; error?: string }>
  timestamp: number
  abortController?: AbortController
}

const requestCache = new Map<string, RequestCacheItem<any>>()
const MAX_CACHE_ITEMS = 50
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

// Generate cache key for requests
function generateCacheKey(method: string, path: string, body?: Record<string, unknown>): string {
  const bodyStr = body ? JSON.stringify(body) : ''
  return `${method}:${path}:${bodyStr}`
}

// Cleanup expired cache items
function cleanupCache() {
  const now = Date.now()
  for (const [key, item] of requestCache.entries()) {
    if (now - item.timestamp > CACHE_TTL) {
      requestCache.delete(key)
    }
  }
  
  // Limit cache size
  if (requestCache.size > MAX_CACHE_ITEMS) {
    const entries = Array.from(requestCache.entries())
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, requestCache.size - MAX_CACHE_ITEMS)
    toDelete.forEach(([key]) => requestCache.delete(key))
  }
}

/**
 * HTTP Transport - Makes API calls to server with caching and deduping
 */
export async function httpRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal
): Promise<{ success: boolean; data?: T; error?: string }> {
  // Cleanup expired cache
  cleanupCache()
  
  const token = getAuthToken()
  const url = `${getServerUrl()}${path}`
  const cacheKey = generateCacheKey(method, path, body)
  
  // Only use cache for GET requests
  if (method === 'GET' && requestCache.has(cacheKey)) {
    const cachedItem = requestCache.get(cacheKey)!
    console.log(`[HTTP] ${method} ${path} - using cached request`)
    
    // If signal is provided, link it to the existing request
    if (signal && cachedItem.abortController) {
      signal.addEventListener('abort', () => {
        cachedItem.abortController?.abort()
      })
    }
    
    return cachedItem.promise
  }
  
  // Create new request
  const abortController = new AbortController()
  
  // Link external signal to our abort controller
  if (signal) {
    signal.addEventListener('abort', () => {
      abortController.abort()
    })
  }
  
  console.log(`[HTTP] ${method} ${path} - token: ${token ? 'present' : 'missing'}`)
  
  const promise = (async (): Promise<{ success: boolean; data?: T; error?: string }> => {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: abortController.signal
      })

      // Check content type to detect non-JSON responses (e.g. HTML error pages)
      const contentType = response.headers.get('content-type') || ''

      // Handle 401 - token expired or invalid
      if (response.status === 401) {
        console.warn(`[HTTP] ${method} ${path} - 401 Unauthorized, attempting to refresh token`)
        const refreshToken = getRefreshToken()

        // If we have a refresh token, try to refresh
        if (refreshToken && !isRefreshing) {
          isRefreshing = true

          try {
            const refreshResponse = await fetch(`${getServerUrl()}/api/v1/auth/refresh`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ refreshToken })
            })

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json()
              if (refreshData.success) {
                const { accessToken, refreshToken: newRefreshToken, expiresIn } = refreshData.data
                setAuthToken(accessToken, newRefreshToken)
                localStorage.setItem('halo_token_expires_at', (Date.now() + expiresIn * 1000).toString())
                console.log('[HTTP] Token refreshed successfully')

                // Process queued requests
                onRefreshed(accessToken)
                isRefreshing = false

                // Retry the original request
                const originalRequest = await fetch(url, {
                  method,
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`
                  },
                  body: body ? JSON.stringify(body) : undefined,
                  signal: abortController.signal
                })

                if (originalRequest.ok) {
                  return originalRequest.json()
                }
              }
            }

            // If refresh failed, clear tokens and redirect to login
            console.warn('[HTTP] Token refresh failed, clearing tokens')
            clearAuthToken()
            document.cookie = 'halo_authenticated=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
            if (window.location.pathname !== '/login') {
              window.location.href = '/login'
            }
            return { success: false, error: 'Session expired, please login again' }

          } catch (refreshError) {
            console.error('[HTTP] Token refresh error:', refreshError)
            clearAuthToken()
            document.cookie = 'halo_authenticated=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
            if (window.location.pathname !== '/login') {
              window.location.href = '/login'
            }
            return { success: false, error: 'Session expired, please login again' }
          }
        } else if (isRefreshing) {
          // If already refreshing, queue this request
          return new Promise(resolve => {
            addRefreshSubscriber((newToken: string) => {
              // Retry with new token
              fetch(url, {
                method,
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${newToken}`
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: abortController.signal
              })
              .then(res => res.json())
              .then(resolve)
            })
          })
        } else {
          // No refresh token, clear and redirect to login
          console.warn('[HTTP] No refresh token available, clearing tokens')
          clearAuthToken()
          document.cookie = 'halo_authenticated=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
          if (window.location.pathname !== '/login') {
            window.location.href = '/login'
          }
          const errorData = await response.json().catch(() => ({}))
          return { success: false, error: errorData?.error?.message || 'Authentication required' }
        }
      }

      // Handle non-JSON responses (e.g. HTML 404/500 pages)
      if (!contentType.includes('application/json')) {
        const text = await response.text().catch(() => 'Unknown response')
        console.error(`[HTTP] ${method} ${path} - non-JSON response (${contentType}):`, text.slice(0, 200))
        return {
          success: false,
          error: `Server returned non-JSON response (${response.status} ${response.statusText}). This may indicate a server configuration issue.`
        }
      }

      const data = await response.json()
      console.log(`[HTTP] ${method} ${path} - status: ${response.status}, success: ${data.success}`)

      if (!response.ok) {
        console.warn(`[HTTP] ${method} ${path} - error:`, data.error)
      }

      if (data && typeof data.error === 'object' && data.error !== null) {
        data.error = data.error.message || JSON.stringify(data.error)
      }

      return data
    } catch (error) {
      console.error(`[HTTP] ${method} ${path} - exception:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      }
    } finally {
      // Remove from cache after completion for non-GET requests
      if (method !== 'GET') {
        requestCache.delete(cacheKey)
      }
    }
  })()
  
  // Store in cache only for GET requests
  if (method === 'GET') {
    requestCache.set(cacheKey, {
      promise,
      timestamp: Date.now(),
      abortController
    })
  }
  
  return promise
}

// Clear request cache
export function clearRequestCache(): void {
  requestCache.clear()
}

// Invalidate specific cache entry
export function invalidateCache(method: string, path: string, body?: Record<string, unknown>): void {
  const cacheKey = generateCacheKey(method, path, body)
  requestCache.delete(cacheKey)
}

/**
 * WebSocket connection for real-time events
 */
let wsConnection: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
const wsEventListeners = new Map<string, Set<(data: unknown) => void>>()

// Connection state tracking
let isConnectionReady = false

export function connectWebSocket(authMode?: string): void {
  if (wsConnection?.readyState === WebSocket.OPEN) return

  const token = getAuthToken()

  // Build WebSocket URL with optional token
  let wsUrl = `${getServerUrl().replace('http', 'ws')}/ws`
  if (token) {
    wsUrl += `?token=${encodeURIComponent(token)}`
    console.log('[WS] Connecting to:', wsUrl.replace(token, '***'))
  } else if (authMode === 'disabled') {
    // disabled mode: connect without token
    console.log('[WS] Connecting without token (disabled mode)')
  } else {
    console.warn('[WS] No auth token, cannot connect')
    return
  }

  wsConnection = new WebSocket(wsUrl)

  wsConnection.onopen = () => {
    console.log('[WS] Connected')
    isConnectionReady = false // Will be set to true after auth:success
    // Authenticate
    wsConnection?.send(JSON.stringify({ type: 'auth', payload: { token } }))
  }

  wsConnection.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)

      if (message.type === 'auth:success') {
        console.log('[WS] Authenticated')
        isConnectionReady = true
        return
      }


      // Handle agent events from backend (format: { type: 'agent:event', payload: { eventType, data } })
      if (message.type === 'agent:event') {
        const { eventType, data } = message.payload
        console.log(`[WS] Received agent event: ${eventType}, conversation: ${data?.conversationId}`)
        const listeners = wsEventListeners.get(eventType)
        if (listeners) {
          listeners.forEach((callback) => {
            callback(data)
          })
        }
        return
      }

      // Handle legacy event format (format: { type: 'event', channel, data })
      if (message.type === 'event') {
        const listeners = wsEventListeners.get(message.channel)
        if (listeners) {
          listeners.forEach((callback) => {
            callback(message.data)
          })
        }
        return
      }

      // Handle other message types
      console.log('[WS] Received message:', message.type)
    } catch (error) {
      console.error('[WS] Failed to parse message:', error)
    }
  }

  wsConnection.onclose = () => {
    console.log('[WS] Disconnected')
    wsConnection = null
    isConnectionReady = false

    // Attempt to reconnect after 3 seconds
    if (getAuthToken()) {
      wsReconnectTimer = setTimeout(connectWebSocket, 3000)
    }
  }

  wsConnection.onerror = (error) => {
    console.error('[WS] Error:', error)
  }
}

export function disconnectWebSocket(): void {
  if (wsReconnectTimer) {
    clearTimeout(wsReconnectTimer)
    wsReconnectTimer = null
  }

  if (wsConnection) {
    wsConnection.close()
    wsConnection = null
  }
}


/**
 * Register event listener (WebSocket only in B/S mode)
 */
export function onEvent(channel: string, callback: (data: unknown) => void): () => void {
  if (!wsEventListeners.has(channel)) {
    wsEventListeners.set(channel, new Set())
  }
  wsEventListeners.get(channel)!.add(callback)

  return () => {
    wsEventListeners.get(channel)?.delete(callback)
  }
}

/**
 * Dispatch event to listeners (used by SSE to emit events)
 * This allows SSE events to be received by the same listeners as WebSocket events
 */
export function dispatchEvent(eventType: string, data: unknown): void {
  const listeners = wsEventListeners.get(eventType)
  if (listeners) {
    listeners.forEach((callback) => {
      callback(data)
    })
  }
}
