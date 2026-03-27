/**
 * Halo API - HTTP-only mode for B/S architecture
 * All API calls go through HTTP/WebSocket to the backend server
 */

import {
  httpRequest,
  onEvent,
  connectWebSocket,
  disconnectWebSocket,
  setAuthToken,
  clearAuthToken,
  getAuthToken,
  dispatchEvent
} from './transport'
import { sendMessageSSE, type SSEEvent, type SendMessageParams } from './sse'
import type {
  HealthStatusResponse,
  HealthStateResponse,
  HealthRecoveryResponse,
  HealthReportResponse,
  HealthExportResponse,
  HealthCheckResponse
} from '../../shared/types'

// Response type
interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

/**
 * API object - HTTP-only implementation for B/S architecture
 */
export const api = {
  // ===== Authentication =====
  isRemoteMode: () => true,
  isAuthenticated: () => !!getAuthToken(),

  // Username/password login
  login: async (username: string, password: string): Promise<ApiResponse<{ tokens: { accessToken: string }; user: { id: string; email: string } }>> => {
    const result = await httpRequest<any>('POST', '/api/v1/auth/login', { email: username, password })
    if (result.success && result.data?.tokens?.accessToken) {
      setAuthToken(result.data.tokens.accessToken)
      connectWebSocket()
    }
    return result
  },

  logout: async (): Promise<ApiResponse> => {
    const result = await httpRequest<void>('POST', '/api/v1/auth/logout')
    if (result.success) {
      clearAuthToken()
      disconnectWebSocket()
    }
    return result
  },

  getCurrentUser: async (): Promise<ApiResponse<{ id: string; username: string }>> => {
    return httpRequest('GET', '/api/v1/auth/me')
  },

  getAuthConfig: async (): Promise<ApiResponse<{ mode: string }>> => {
    return httpRequest('GET', '/api/v1/auth/config')
  },

  connectWebSocket: (authMode?: string) => {
    connectWebSocket(authMode)
  },

  disconnectWebSocket: () => {
    disconnectWebSocket()
  },

  // ===== Generic Auth (provider-agnostic) =====
  authGetProviders: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/auth/providers')
  },

  authStartLogin: async (providerType: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/auth/start-login', { providerType })
  },

  authCompleteLogin: async (providerType: string, state: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/auth/complete-login', { providerType, state })
  },

  authRefreshToken: async (providerType: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/auth/refresh-token', { providerType })
  },

  authCheckToken: async (providerType: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/auth/check-token?providerType=${providerType}`)
  },

  authLogout: async (providerType: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/auth/logout', { providerType })
  },

  onAuthLoginProgress: (callback: (data: { provider: string; status: string }) => void) =>
    onEvent('auth:login-progress', callback as (data: unknown) => void),

  // ===== Config =====
  getConfig: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/configs')
  },

  setConfig: async (updates: Record<string, unknown>): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/configs', updates)
  },

  validateApi: async (
    apiKey: string,
    apiUrl: string,
    provider: string,
    model?: string
  ): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/ai-sources/validate', { apiKey, apiUrl, provider, model })
  },

  fetchModels: async (
    apiKey: string,
    apiUrl: string
  ): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/ai-sources/fetch-models', { apiKey, apiUrl })
  },

  refreshAISourcesConfig: async (): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/configs/refresh-ai-sources')
  },

  // ===== AI Sources CRUD =====
  aiSourcesSwitchSource: async (sourceId: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/ai-sources/switch-source', { sourceId })
  },

  aiSourcesSetModel: async (modelId: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/ai-sources/set-model', { modelId })
  },

  aiSourcesAddSource: async (source: unknown): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/ai-sources/sources', source as Record<string, unknown>)
  },

  aiSourcesUpdateSource: async (sourceId: string, updates: unknown): Promise<ApiResponse> => {
    return httpRequest('PUT', `/api/v1/ai-sources/sources/${sourceId}`, updates as Record<string, unknown>)
  },

  aiSourcesDeleteSource: async (sourceId: string): Promise<ApiResponse> => {
    return httpRequest('DELETE', `/api/v1/ai-sources/sources/${sourceId}`)
  },

  // ===== AI Sources File Config =====
  aiSourcesGetFileConfig: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/ai-sources/file-config')
  },

  aiSourcesGetFileConfigFull: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/ai-sources/file-config/full')
  },

  aiSourcesMigrate: async (checkOnly?: boolean): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/ai-sources/migrate', { checkOnly })
  },

  // ===== Space =====
  getHaloSpace: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/spaces/halo')
  },

  listSpaces: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/spaces')
  },

  createSpace: async (input: {
    name: string
    icon: string
    customPath?: string
  }): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/spaces', input)
  },

  deleteSpace: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('DELETE', `/api/v1/spaces/${spaceId}`)
  },

  getSpace: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/spaces/${spaceId}`)
  },

  openSpaceFolder: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/spaces/${spaceId}/open`)
  },

  getDefaultSpacePath: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/spaces/default-path')
  },

  selectFolder: async (): Promise<ApiResponse> => {
    // In web mode, folder selection is handled by ServerFolderPicker component
    // This method is kept for compatibility but should not be called directly in web mode
    return { success: false, error: 'Use ServerFolderPicker component in web mode' }
  },

  // ===== Filesystem Browsing (B/S mode) =====
  getFilesystemRoots: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/filesystem/roots')
  },

  browseFilesystem: async (path: string, showHidden?: boolean): Promise<ApiResponse> => {
    const params = new URLSearchParams({ path })
    if (showHidden) params.set('showHidden', 'true')
    return httpRequest('GET', `/api/v1/filesystem/browse?${params.toString()}`)
  },

  createDirectory: async (path: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/filesystem/mkdir', { path })
  },

  updateSpace: async (
    spaceId: string,
    updates: { name?: string; icon?: string }
  ): Promise<ApiResponse> => {
    return httpRequest('PUT', `/api/v1/spaces/${spaceId}`, updates)
  },

  updateSpacePreferences: async (
    spaceId: string,
    preferences: {
      layout?: {
        artifactRailExpanded?: boolean
        chatWidth?: number
      }
    }
  ): Promise<ApiResponse> => {
    return httpRequest('PUT', `/api/v1/spaces/${spaceId}/preferences`, preferences)
  },

  getSpacePreferences: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/preferences`)
  },

  // ===== Conversation =====
  listConversations: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/conversations`)
  },

  createConversation: async (spaceId: string, title?: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/spaces/${spaceId}/conversations`, { title })
  },

  getConversation: async (
    spaceId: string,
    conversationId: string
  ): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/conversations/${conversationId}`)
  },

  updateConversation: async (
    spaceId: string,
    conversationId: string,
    updates: Record<string, unknown>
  ): Promise<ApiResponse> => {
    return httpRequest(
      'PUT',
      `/api/v1/spaces/${spaceId}/conversations/${conversationId}`,
      updates
    )
  },

  deleteConversation: async (
    spaceId: string,
    conversationId: string
  ): Promise<ApiResponse> => {
    return httpRequest(
      'DELETE',
      `/api/v1/spaces/${spaceId}/conversations/${conversationId}`
    )
  },

  addMessage: async (
    spaceId: string,
    conversationId: string,
    message: { role: string; content: string }
  ): Promise<ApiResponse> => {
    return httpRequest(
      'POST',
      `/api/v1/spaces/${spaceId}/conversations/${conversationId}/messages`,
      message
    )
  },

  updateLastMessage: async (
    spaceId: string,
    conversationId: string,
    updates: Record<string, unknown>
  ): Promise<ApiResponse> => {
    return httpRequest(
      'PUT',
      `/api/v1/spaces/${spaceId}/conversations/${conversationId}/messages/last`,
      updates
    )
  },

  getMessageThoughts: async (
    spaceId: string,
    conversationId: string,
    messageId: string
  ): Promise<ApiResponse> => {
    return httpRequest(
      'GET',
      `/api/v1/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}/thoughts`
    )
  },

  toggleStarConversation: async (
    spaceId: string,
    conversationId: string,
    starred: boolean
  ): Promise<ApiResponse> => {
    return httpRequest(
      'POST',
      `/api/v1/spaces/${spaceId}/conversations/${conversationId}/star`,
      { starred }
    )
  },

  // ===== Agent =====
  /**
   * 发送消息到 Agent（使用 SSE 流式响应）
   *
   * SSE 事件通过 dispatchEvent 分发到 WebSocket 监听器（双通道架构）
   * 这确保了 App.tsx 中的 onAgentXxx 回调能够接收到事件
   */
  sendMessage: async (request: {
    spaceId: string
    conversationId: string
    message: string
    clientMessageId?: string  // 客户端生成的消息 ID
    resumeSessionId?: string
    images?: Array<{
      id: string
      type: 'image'
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      data: string
      name?: string
      size?: number
    }>
    aiBrowserEnabled?: boolean
    thinkingEnabled?: boolean
    canvasContext?: {
      isOpen: boolean
      tabCount: number
      activeTab: {
        type: string
        title: string
        url?: string
        path?: string
      } | null
      tabs: Array<{
        type: string
        title: string
        url?: string
        path?: string
        isActive: boolean
      }>
    }
  }, signal?: AbortSignal): Promise<ApiResponse> => {
    // 构建 SSE 请求参数
    const sseParams: SendMessageParams = {
      spaceId: request.spaceId,
      conversationId: request.conversationId,
      message: request.message,
      clientMessageId: request.clientMessageId,  // 传递客户端消息 ID
      images: request.images,
      aiBrowserEnabled: request.aiBrowserEnabled,
      thinkingEnabled: request.thinkingEnabled,
      canvasContext: request.canvasContext
    }

    // 发送 SSE 请求
    // 事件通过 dispatchEvent 分发到 WebSocket 监听器
    const result = await sendMessageSSE(
      sseParams,
      // onEvent: 处理 SSE 事件并分发到监听器
      (event: SSEEvent) => {
        // 将 SSE 事件名转换为 agent:* 格式
        // SSE event: "message" -> agent:eventType: "agent:message"
        // SSE event: "thought" -> agent:eventType: "agent:thought"
        const agentEventType = `agent:${event.event}`

        // 分发事件到 WebSocket 监听器
        // 这确保 App.tsx 中的 onAgentXxx 回调能够接收到事件
        dispatchEvent(agentEventType, event.data)
      },
      // onError: 处理错误
      (error: Error) => {
        console.error('[SSE] Error:', error.message)
      },
      // signal: 用于取消请求
      signal
    )

    if (result.success) {
      return { success: true }
    } else {
      return { success: false, error: result.error }
    }
  },

  stopGeneration: async (conversationId?: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/agent/stop', { conversationId })
  },

  approveTool: async (conversationId: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/agent/approve', { conversationId })
  },

  rejectTool: async (conversationId: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/agent/reject', { conversationId })
  },

  getSessionState: async (conversationId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/agent/session/${conversationId}`)
  },

  ensureSessionWarm: async (spaceId: string, conversationId: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/agent/warm', { spaceId, conversationId }).catch(() => ({
      success: false
    }))
  },

  answerQuestion: async (data: {
    conversationId: string
    id: string
    answers: Record<string, string>
  }): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/agent/answer-question', data)
  },

  testMcpConnections: async (): Promise<{ success: boolean; servers: unknown[]; error?: string }> => {
    const result = await httpRequest('POST', '/api/v1/agent/test-mcp')
    return result as { success: boolean; servers: unknown[]; error?: string }
  },

  // ===== Artifact =====
  listArtifacts: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/artifacts`)
  },

  listArtifactsTree: async (spaceId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/artifacts/tree`)
  },

  loadArtifactChildren: async (spaceId: string, dirPath: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/spaces/${spaceId}/artifacts/children`, { dirPath })
  },

  initArtifactWatcher: async (_spaceId: string): Promise<ApiResponse> => {
    // Watcher is managed by server
    return { success: true }
  },

  onArtifactChanged: <T = unknown>(callback: (data: {
    type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
    path: string
    relativePath: string
    spaceId: string
    item?: T
  }) => void) => {
    return onEvent('artifact:changed', callback as (data: unknown) => void)
  },

  onArtifactTreeUpdate: <T = unknown>(callback: (data: {
    spaceId: string
    updatedDirs: Array<{ dirPath: string; children: T[] }>
    changes: Array<{
      type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
      path: string
      relativePath: string
      spaceId: string
      item?: T
    }>
  }) => void) => {
    return onEvent('artifact:tree-update', callback as (data: unknown) => void)
  },

  openArtifact: async (_filePath: string): Promise<ApiResponse> => {
    return { success: false, error: 'Cannot open files in web mode' }
  },

  showArtifactInFolder: async (_filePath: string): Promise<ApiResponse> => {
    return { success: false, error: 'Cannot open folder in web mode' }
  },

  downloadArtifact: (filePath: string): void => {
    const token = getAuthToken()
    const url = `/api/v1/artifacts/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token || '')}`
    const link = document.createElement('a')
    link.href = url
    link.download = filePath.split('/').pop() || 'download'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  },

  getArtifactDownloadUrl: (filePath: string): string => {
    const token = getAuthToken()
    return `/api/v1/artifacts/download?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token || '')}`
  },

  readArtifactContent: async (filePath: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/artifacts/content?path=${encodeURIComponent(filePath)}`)
  },

  saveArtifactContent: async (filePath: string, content: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/artifacts/save', { path: filePath, content })
  },

  /**
   * 读取空间文件内容
   * @param spaceId 空间 ID
   * @param filePath 文件相对路径
   */
  readFileContent: async (spaceId: string, filePath: string): Promise<ApiResponse<{
    content?: string
    path: string
    mimeType: string
    size: number
    language?: string
    isBinary: boolean
  }>> => {
    const encodedPath = encodeURIComponent(filePath)
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/files/${encodedPath}/content`)
  },

  /**
   * 检测文件类型
   * @param spaceId 空间 ID
   * @param filePath 文件相对路径
   */
  detectFileType: async (spaceId: string, filePath: string): Promise<ApiResponse<{
    type: 'code' | 'markdown' | 'image' | 'json' | 'text' | 'binary' | 'unknown'
    mimeType: string
    language?: string
  }>> => {
    const encodedPath = encodeURIComponent(filePath)
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/files/${encodedPath}/detect-type`)
  },

  /**
   * 列出空间文件目录
   * @param spaceId 空间 ID
   * @param dirPath 目录路径（可选，默认为根目录）
   */
  listFiles: async (spaceId: string, dirPath?: string): Promise<ApiResponse<{
    path: string
    files: Array<{
      name: string
      path: string
      isDirectory: boolean
      size: number
      modifiedAt: string
    }>
  }>> => {
    const params = dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''
    return httpRequest('GET', `/api/v1/spaces/${spaceId}/files${params}`)
  },

  // ===== Onboarding =====
  writeOnboardingArtifact: async (
    spaceId: string,
    fileName: string,
    content: string
  ): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/spaces/${spaceId}/onboarding/artifact`, { fileName, content })
  },

  saveOnboardingConversation: async (
    spaceId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/spaces/${spaceId}/onboarding/conversation`, { userMessage, aiResponse })
  },

  // ===== Remote Access (not available in B/S mode) =====
  enableRemoteAccess: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  disableRemoteAccess: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  enableTunnel: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  disableTunnel: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  getRemoteStatus: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  getRemoteQRCode: async (_forceRefresh?: boolean): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  setRemotePassword: async (_password: string): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  regenerateRemotePassword: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  onRemoteStatusChange: (callback: (data: unknown) => void) =>
    onEvent('remote:status-change', callback),

  // ===== System Settings (not available in B/S mode) =====
  getAutoLaunch: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  setAutoLaunch: async (_enabled: boolean): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  openLogFolder: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  // ===== Window (not available in B/S mode) =====
  setTitleBarOverlay: async (_options: { color: string; symbolColor: string }): Promise<ApiResponse> => {
    return { success: true }
  },

  maximizeWindow: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  unmaximizeWindow: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  isWindowMaximized: async (): Promise<ApiResponse<boolean>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  toggleMaximizeWindow: async (): Promise<ApiResponse<boolean>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  onWindowMaximizeChange: (_callback: (isMaximized: boolean) => void) => {
    return () => {}
  },

  // ===== Notification Channels =====
  testNotificationChannel: async (channelType: string): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/notify-channels/test', { channelType })
  },

  clearNotificationChannelCache: async (): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/notify-channels/clear-cache')
  },

  // ===== Event Listeners =====
  onAgentMessage: (callback: (data: unknown) => void) =>
    onEvent('agent:message', callback),
  onAgentToolCall: (callback: (data: unknown) => void) =>
    onEvent('agent:tool-call', callback),
  onAgentToolResult: (callback: (data: unknown) => void) =>
    onEvent('agent:tool-result', callback),
  onAgentError: (callback: (data: unknown) => void) =>
    onEvent('agent:error', callback),
  onAgentComplete: (callback: (data: unknown) => void) =>
    onEvent('agent:complete', callback),
  onAgentThought: (callback: (data: unknown) => void) =>
    onEvent('agent:thought', callback),
  onAgentThoughtDelta: (callback: (data: unknown) => void) =>
    onEvent('agent:thought-delta', callback),
  onAgentMcpStatus: (callback: (data: unknown) => void) =>
    onEvent('agent:mcp-status', callback),
  onAgentCompact: (callback: (data: unknown) => void) =>
    onEvent('agent:compact', callback),
  onAgentAskQuestion: (callback: (data: unknown) => void) =>
    onEvent('agent:ask-question', callback),
  onAgentWaitingForInput: (callback: (data: unknown) => void) =>
    onEvent('agent:waiting-for-input', callback),

  // ===== WebSocket Control =====

  // ===== Browser (not available in B/S mode) =====
  createBrowserView: async (_viewId: string, _url?: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  destroyBrowserView: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  showBrowserView: async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  hideBrowserView: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  resizeBrowserView: async (_viewId: string, _bounds: { x: number; y: number; width: number; height: number }): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  navigateBrowserView: async (_viewId: string, _url: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserGoBack: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserGoForward: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserReload: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  browserStop: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  getBrowserState: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  captureBrowserView: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  executeBrowserJS: async (_viewId: string, _code: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  setBrowserZoom: async (_viewId: string, _level: number): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  toggleBrowserDevTools: async (_viewId: string): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  showBrowserContextMenu: async (_options: { viewId: string; url?: string; zoomLevel: number }): Promise<ApiResponse> => {
    return { success: false, error: 'Browser views only available in desktop app' }
  },

  onBrowserStateChange: (callback: (data: unknown) => void) =>
    onEvent('browser:state-change', callback),

  onBrowserZoomChanged: (callback: (data: { viewId: string; zoomLevel: number }) => void) =>
    onEvent('browser:zoom-changed', callback as (data: unknown) => void),

  showCanvasTabContextMenu: async (_options: {
    tabId: string
    tabIndex: number
    tabTitle: string
    tabPath?: string
    tabCount: number
    hasTabsToRight: boolean
  }): Promise<ApiResponse> => {
    return { success: false, error: 'Native menu only available in desktop app' }
  },

  onCanvasTabAction: (callback: (data: {
    action: 'close' | 'closeOthers' | 'closeToRight' | 'copyPath' | 'refresh'
    tabId?: string
    tabIndex?: number
    tabPath?: string
  }) => void) =>
    onEvent('canvas:tab-action', callback as (data: unknown) => void),

  onAIBrowserActiveViewChanged: (callback: (data: { viewId: string; url: string | null; title: string | null }) => void) =>
    onEvent('ai-browser:active-view-changed', callback as (data: unknown) => void),

  // ===== Search =====
  search: async (
    query: string,
    scope: 'conversation' | 'space' | 'global',
    conversationId?: string,
    spaceId?: string
  ): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/search', {
      query,
      scope,
      conversationId,
      spaceId
    })
  },

  cancelSearch: async (): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/search/cancel')
  },

  onSearchProgress: (callback: (data: { current: number; total: number; searchId: string }) => void) =>
    onEvent('search:progress', callback as (data: unknown) => void),

  onSearchCancelled: (callback: () => void) =>
    onEvent('search:cancelled', callback),

  // ===== Updater (not available in B/S mode) =====
  checkForUpdates: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  installUpdate: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  getVersion: async (): Promise<ApiResponse<string>> => {
    return httpRequest('GET', '/api/v1/system/version')
  },

  onUpdaterStatus: (_callback: (data: {
    status: 'checking' | 'not-available' | 'manual-download' | 'available' | 'downloaded' | 'error'
    version?: string
    releaseNotes?: string
  }) => void) => {
    return () => {}
  },

  // ===== Notification (in-app toast) =====
  onNotificationToast: (callback: (data: {
    title: string
    body?: string
    variant?: 'default' | 'success' | 'warning' | 'error'
    duration?: number
    appId?: string
  }) => void) => {
    // In B/S mode, notifications come through WebSocket
    return onEvent('notification:toast', callback as (data: unknown) => void)
  },

  // ===== Overlay (not available in B/S mode) =====
  showChatCapsuleOverlay: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  hideChatCapsuleOverlay: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  onCanvasExitMaximized: (_callback: () => void) => {
    return () => {}
  },

  // ===== Performance Monitoring (not available in B/S mode) =====
  perfStart: async (_config?: { sampleInterval?: number; maxSamples?: number }): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  perfStop: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  perfGetState: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  perfGetHistory: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  perfClearHistory: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  perfSetConfig: async (): Promise<ApiResponse> => {
    return { success: false, error: 'Not available in web mode' }
  },

  perfExport: async (): Promise<ApiResponse<string>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  onPerfSnapshot: (callback: (data: unknown) => void) =>
    onEvent('perf:snapshot', callback),

  onPerfWarning: (callback: (data: unknown) => void) =>
    onEvent('perf:warning', callback),

  perfReportRendererMetrics: (_metrics: {
    fps: number
    frameTime: number
    renderCount: number
    domNodes: number
    eventListeners: number
    jsHeapUsed: number
    jsHeapLimit: number
    longTasks: number
  }): void => {
    // No-op in web mode
  },

  // ===== Git Bash (not available in B/S mode) =====
  getGitBashStatus: async (): Promise<ApiResponse<{
    found: boolean
    path: string | null
    source: 'system' | 'app-local' | 'env-var' | null
  }>> => {
    return { success: true, data: { found: true, path: null, source: null } }
  },

  installGitBash: async (_onProgress: (progress: {
    phase: 'downloading' | 'extracting' | 'configuring' | 'done' | 'error'
    progress: number
    message: string
    error?: string
  }) => void): Promise<{ success: boolean; path?: string; error?: string }> => {
    return { success: false, error: 'Not available in web mode' }
  },

  openExternal: async (url: string): Promise<void> => {
    window.open(url, '_blank')
  },

  // ===== Bootstrap Lifecycle =====
  getBootstrapStatus: async (): Promise<{
    extendedReady: boolean
    extendedReadyAt: number
  }> => {
    return { extendedReady: true, extendedReadyAt: Date.now() }
  },

  onBootstrapExtendedReady: (callback: (data: { timestamp: number; duration: number }) => void) => {
    setTimeout(() => callback({ timestamp: Date.now(), duration: 0 }), 0)
    return () => {}
  },

  // ===== Health System (not available in B/S mode) =====
  getHealthStatus: async (): Promise<ApiResponse<HealthStatusResponse>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  getHealthState: async (): Promise<ApiResponse<HealthStateResponse>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  triggerHealthRecovery: async (_strategyId: string, _force?: boolean): Promise<ApiResponse<HealthRecoveryResponse>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  generateHealthReport: async (): Promise<ApiResponse<HealthReportResponse>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  generateHealthReportText: async (): Promise<ApiResponse<string>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  exportHealthReport: async (): Promise<ApiResponse<HealthExportResponse>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  runHealthCheck: async (): Promise<ApiResponse<HealthCheckResponse>> => {
    return { success: false, error: 'Not available in web mode' }
  },

  // ===== Apps =====
  appList: async (filter?: { spaceId?: string; status?: string; type?: string }): Promise<ApiResponse> => {
    const params = new URLSearchParams()
    if (filter?.spaceId) params.set('spaceId', filter.spaceId)
    if (filter?.status) params.set('status', filter.status)
    if (filter?.type) params.set('type', filter.type)
    const qs = params.toString()
    return httpRequest('GET', `/api/v1/apps${qs ? '?' + qs : ''}`)
  },

  appGet: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/apps/${appId}`)
  },

  appInstall: async (input: { spaceId: string; spec: unknown; userConfig?: Record<string, unknown> }): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/apps/install', input as Record<string, unknown>)
  },

  appUninstall: async (appId: string, options?: { purge?: boolean }): Promise<ApiResponse> => {
    const qs = options?.purge ? '?purge=true' : ''
    return httpRequest('DELETE', `/api/v1/apps/${appId}${qs}`)
  },

  appReinstall: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/reinstall`)
  },

  appDelete: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('DELETE', `/api/v1/apps/${appId}/permanent`)
  },

  appPause: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/pause`)
  },

  appResume: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/resume`)
  },

  appTrigger: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/trigger`)
  },

  appGetState: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/apps/${appId}/state`)
  },

  appGetActivity: async (appId: string, options?: { limit?: number; offset?: number; type?: string; since?: number }): Promise<ApiResponse> => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.offset) params.set('offset', String(options.offset))
    if (options?.since) params.set('before', String(options.since))
    const qs = params.toString()
    return httpRequest('GET', `/api/v1/apps/${appId}/activity${qs ? '?' + qs : ''}`)
  },

  appGetSession: async (appId: string, runId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/apps/${appId}/runs/${runId}/session`)
  },

  appRespondEscalation: async (appId: string, escalationId: string, response: { choice?: string; text?: string }): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/escalation/${escalationId}/respond`, response as Record<string, unknown>)
  },

  appUpdateConfig: async (appId: string, config: Record<string, unknown>): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/config`, config)
  },

  appUpdateFrequency: async (appId: string, subscriptionId: string, frequency: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/frequency`, { subscriptionId, frequency })
  },

  appUpdateOverrides: async (appId: string, overrides: Record<string, unknown>): Promise<ApiResponse> => {
    return httpRequest('PATCH', `/api/v1/apps/${appId}/overrides`, overrides)
  },

  appUpdateSpec: async (appId: string, specPatch: Record<string, unknown>): Promise<ApiResponse> => {
    return httpRequest('PATCH', `/api/v1/apps/${appId}/spec`, specPatch)
  },

  appGrantPermission: async (appId: string, permission: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/permissions/grant`, { permission })
  },

  appRevokePermission: async (appId: string, permission: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/permissions/revoke`, { permission })
  },

  appExportSpec: async (appId: string): Promise<ApiResponse<{ yaml: string; filename: string }>> => {
    return httpRequest('GET', `/api/v1/apps/${appId}/export-spec`)
  },

  appImportSpec: async (input: { spaceId: string; yamlContent: string; userConfig?: Record<string, unknown> }): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/apps/import-spec', input as Record<string, unknown>)
  },

  appChatSend: async (request: { appId: string; spaceId: string; message: string; thinkingEnabled?: boolean }): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${request.appId}/chat/send`, request as unknown as Record<string, unknown>)
  },

  appChatStop: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/apps/${appId}/chat/stop`)
  },

  appChatStatus: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/apps/${appId}/chat/status`)
  },

  appChatMessages: async (appId: string, spaceId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/apps/${appId}/chat/messages?spaceId=${spaceId}`)
  },

  appChatSessionState: async (appId: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/apps/${appId}/chat/session-state`)
  },

  onAppStatusChanged: (callback: (data: unknown) => void) =>
    onEvent('app:status_changed', callback),

  onAppActivityEntry: (callback: (data: unknown) => void) =>
    onEvent('app:activity_entry:new', callback),

  onAppEscalation: (callback: (data: unknown) => void) =>
    onEvent('app:escalation:new', callback),

  onAppNavigate: (callback: (data: unknown) => void) =>
    onEvent('app:navigate', callback),

  // ===== Store (App Registry) =====
  storeListApps: async (query: { search?: string; locale?: string; category?: string; type?: string; tags?: string[] }): Promise<ApiResponse> => {
    const params = new URLSearchParams()
    if (query.search) params.set('search', query.search)
    if (query.locale) params.set('locale', query.locale)
    if (query.category) params.set('category', query.category)
    if (query.type) params.set('type', query.type)
    if (query.tags && query.tags.length > 0) {
      params.set('tags', query.tags.join(','))
    }
    const qs = params.toString()
    return httpRequest('GET', `/api/v1/store/apps${qs ? '?' + qs : ''}`)
  },

  storeGetAppDetail: async (slug: string): Promise<ApiResponse> => {
    return httpRequest('GET', `/api/v1/store/apps/${slug}`)
  },

  storeInstall: async (slug: string, spaceId: string, userConfig?: Record<string, unknown>): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/store/apps/${slug}/install`, { spaceId, userConfig })
  },

  storeRefresh: async (): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/store/refresh')
  },

  storeCheckUpdates: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/store/updates')
  },

  storeGetRegistries: async (): Promise<ApiResponse> => {
    return httpRequest('GET', '/api/v1/store/registries')
  },

  storeAddRegistry: async (input: { name: string; url: string }): Promise<ApiResponse> => {
    return httpRequest('POST', '/api/v1/store/registries', input)
  },

  storeRemoveRegistry: async (registryId: string): Promise<ApiResponse> => {
    return httpRequest('DELETE', `/api/v1/store/registries/${registryId}`)
  },

  storeToggleRegistry: async (registryId: string, enabled: boolean): Promise<ApiResponse> => {
    return httpRequest('POST', `/api/v1/store/registries/${registryId}/toggle`, { enabled })
  },
}

// Export type for the API
export type HaloApi = typeof api
