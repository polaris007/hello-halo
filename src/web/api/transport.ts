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

// Set auth token
export function setAuthToken(token: string): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('halo_remote_token', token)
  }
}

// Clear auth token
export function clearAuthToken(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('halo_remote_token')
  }
}

/**
 * HTTP Transport - Makes API calls to server
 */
export async function httpRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string }> {
  const token = getAuthToken()
  const url = `${getServerUrl()}${path}`

  console.log(`[HTTP] ${method} ${path} - token: ${token ? 'present' : 'missing'}`)

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    })

    // Check content type to detect non-JSON responses (e.g. HTML error pages)
    const contentType = response.headers.get('content-type') || ''

    // Handle 401 - token expired or invalid
    if (response.status === 401) {
      console.warn(`[HTTP] ${method} ${path} - 401 Unauthorized, clearing token`)
      clearAuthToken()
      // Clear the auth cookie
      document.cookie = 'halo_authenticated=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      // Return error, let caller decide how to handle (e.g. show login page)
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: errorData?.error?.message || 'Authentication required' }
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

    return data
  } catch (error) {
    console.error(`[HTTP] ${method} ${path} - exception:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

/**
 * WebSocket connection for real-time events
 */
let wsConnection: WebSocket | null = null
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null
const wsEventListeners = new Map<string, Set<(data: unknown) => void>>()

// Pending subscriptions queue - stores conversation IDs to subscribe when connection is ready
const pendingSubscriptions = new Set<string>()

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
        // Process pending subscriptions
        if (pendingSubscriptions.size > 0) {
          console.log(`[WS] Processing ${pendingSubscriptions.size} pending subscriptions`)
          pendingSubscriptions.forEach(conversationId => {
            subscribeToConversation(conversationId)
          })
          pendingSubscriptions.clear()
        }
        return
      }

      if (message.type === 'subscribed') {
        console.log('[WS] Subscribed to conversation:', message.payload?.conversationId)
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

export function subscribeToConversation(conversationId: string): void {
  // If connection is not ready, queue the subscription
  if (!isConnectionReady || wsConnection?.readyState !== WebSocket.OPEN) {
    console.log(`[WS] Queueing subscription for conversation: ${conversationId}`)
    pendingSubscriptions.add(conversationId)
    return
  }

  console.log(`[WS] Subscribing to conversation: ${conversationId}`)
  wsConnection.send(
    JSON.stringify({
      type: 'subscribe',
      payload: { conversationId }
    })
  )
}

export function unsubscribeFromConversation(conversationId: string): void {
  if (wsConnection?.readyState === WebSocket.OPEN) {
    wsConnection.send(
      JSON.stringify({
        type: 'unsubscribe',
        payload: { conversationId }
      })
    )
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
