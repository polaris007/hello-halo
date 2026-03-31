/**
 * API Client
 * Axios instance with automatic token injection and refresh
 */

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '../stores/authStore'

// Type definitions
export interface Artifact {
  id: string
  name: string
  type: 'file' | 'folder'
  path: string
  relativePath: string
  extension: string
  icon: string
  createdAt: string
  modifiedAt: string
  size?: number
}

export interface ArtifactResponse {
  success: boolean
  data: Artifact[]
  metadata: {
    total: number
    truncated: boolean
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000
})

// Request interceptor - add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const { tokens } = useAuthStore.getState()
    if (tokens?.accessToken) {
      config.headers.Authorization = `Bearer ${tokens.accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor - handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // If error is not 401 or request already retried, reject
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    // Try to refresh token
    const { tokens, logout, setTokens } = useAuthStore.getState()

    if (!tokens?.refreshToken) {
      logout()
      window.location.href = '/login'
      return Promise.reject(error)
    }

    try {
      originalRequest._retry = true

      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken: tokens.refreshToken
      })

      const { accessToken, refreshToken, expiresIn } = response.data.data

      setTokens({
        accessToken,
        refreshToken,
        expiresIn
      })

      // Retry original request with new token
      originalRequest.headers.Authorization = `Bearer ${accessToken}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      // Refresh failed, logout user
      logout()
      window.location.href = '/login'
      return Promise.reject(refreshError)
    }
  }
)

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post('/auth/login', { email, password }),

  register: (email: string, password: string, name?: string) =>
    apiClient.post('/auth/register', { email, password, name }),

  logout: () =>
    apiClient.post('/auth/logout'),

  refreshToken: (refreshToken: string) =>
    apiClient.post('/auth/refresh', { refreshToken }),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post('/auth/change-password', { currentPassword, newPassword }),

  getMe: () =>
    apiClient.get('/auth/me')
}

// Spaces API
export const spacesApi = {
  getAll: () =>
    apiClient.get('/spaces'),

  getById: (id: string) =>
    apiClient.get(`/spaces/${id}`),

  create: (name: string, customPath?: string) =>
    apiClient.post('/spaces', { name, customPath }),

  update: (id: string, name: string) =>
    apiClient.put(`/spaces/${id}`, { name }),

  delete: (id: string) =>
    apiClient.delete(`/spaces/${id}`),

  listArtifacts: async (id: string, depth?: number, showHidden?: boolean, filter?: string): Promise<ArtifactResponse> => {
    try {
      const response = await apiClient.get(`/spaces/${id}/artifacts`, { params: { depth, showHidden, filter } })
      return response.data
    } catch (error) {
      console.error('Error fetching artifacts:', error)
      throw error
    }
  }
}

// Conversations API
export const conversationsApi = {
  getAll: (spaceId: string) =>
    apiClient.get(`/spaces/${spaceId}/conversations`),

  getById: (spaceId: string, conversationId: string) =>
    apiClient.get(`/spaces/${spaceId}/conversations/${conversationId}`),

  create: (spaceId: string, title?: string) =>
    apiClient.post(`/spaces/${spaceId}/conversations`, { title }),

  update: (spaceId: string, conversationId: string, title: string) =>
    apiClient.put(`/spaces/${spaceId}/conversations/${conversationId}`, { title }),

  delete: (spaceId: string, conversationId: string) =>
    apiClient.delete(`/spaces/${spaceId}/conversations/${conversationId}`),

  addMessage: (spaceId: string, conversationId: string, message: any) =>
    apiClient.post(`/spaces/${spaceId}/conversations/${conversationId}/messages`, message),

  updateLastMessage: (spaceId: string, conversationId: string, updates: any) =>
    apiClient.put(`/spaces/${spaceId}/conversations/${conversationId}/messages/last`, updates),

  getThoughts: (spaceId: string, conversationId: string, messageId: string) =>
    apiClient.get(`/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}/thoughts`),

  toggleStar: (spaceId: string, conversationId: string, starred: boolean) =>
    apiClient.post(`/spaces/${spaceId}/conversations/${conversationId}/star`, { starred })
}

// Configs API
export const configsApi = {
  getAll: () =>
    apiClient.get('/configs'),

  getByKey: (key: string) =>
    apiClient.get(`/configs/${key}`),

  set: (key: string, value: any) =>
    apiClient.put(`/configs/${key}`, { value }),

  delete: (key: string) =>
    apiClient.delete(`/configs/${key}`),

  // AI Provider config
  getAIProvider: () =>
    apiClient.get('/configs/ai-provider'),

  setAIProvider: (config: { provider: string; apiKey: string; apiUrl: string; model: string }) =>
    apiClient.put('/configs/ai-provider', config),

  testAIProvider: (config: { provider: string; apiKey: string; apiUrl: string; model: string }) =>
    apiClient.post('/configs/ai-provider/test', config)
}

// Admin API
export const adminApi = {
  getUsers: (page?: number, limit?: number) =>
    apiClient.get('/admin/users', { params: { page, limit } }),

  createUser: (data: { email: string; password: string; name?: string; role?: string }) =>
    apiClient.post('/admin/users', data),

  updateUser: (id: string, data: { name?: string; role?: string }) =>
    apiClient.put(`/admin/users/${id}`, data),

  deleteUser: (id: string) =>
    apiClient.delete(`/admin/users/${id}`),

  getConfig: () =>
    apiClient.get('/admin/config'),

  updateConfig: (config: any) =>
    apiClient.put('/admin/config', config),

  getActivity: (params?: { userId?: string; startDate?: string; endDate?: string; page?: number; limit?: number }) =>
    apiClient.get('/admin/activity', { params })
}

export default apiClient
