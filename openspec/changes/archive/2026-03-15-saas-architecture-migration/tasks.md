# SaaS Architecture Migration - Tasks

## 1. Backend Authentication

- [x] 1.1 Create users table migration script
- [x] 1.2 Implement password hashing utility (bcryptjs)
- [x] 1.3 Implement JWT token generation and validation
- [x] 1.4 Create auth middleware for protecting routes
- [x] 1.5 Implement POST /api/v1/auth/register endpoint
- [x] 1.6 Implement POST /api/v1/auth/login endpoint
- [x] 1.7 Implement POST /api/v1/auth/refresh endpoint
- [x] 1.8 Implement POST /api/v1/auth/logout endpoint
- [x] 1.9 Implement POST /api/v1/auth/change-password endpoint

## 2. Multi-Tenancy Backend

- [x] 2.1 Add user_id column to spaces table
- [x] 2.2 Add user_id column to conversations table
- [x] 2.3 Add user_id column to configs table
- [x] 2.4 Update space service to filter by user_id
- [x] 2.5 Update conversation service to filter by user_id
- [x] 2.6 Update config service to filter by user_id
- [x] 2.7 Create data migration script for existing data
- [x] 2.8 Update all API routes to extract user_id from JWT

## 3. Admin Backend

- [x] 3.1 Implement GET /api/v1/admin/users endpoint
- [x] 3.2 Implement POST /api/v1/admin/users endpoint
- [x] 3.3 Implement PUT /api/v1/admin/users/:id endpoint
- [x] 3.4 Implement DELETE /api/v1/admin/users/:id endpoint
- [x] 3.5 Implement GET /api/v1/admin/config endpoint
- [x] 3.6 Implement PUT /api/v1/admin/config endpoint
- [x] 3.7 Implement GET /api/v1/admin/activity endpoint
- [x] 3.8 Create admin role middleware

## 4. AI Provider Configuration Backend

- [x] 4.1 Implement GET /api/v1/configs/ai-provider endpoint
- [x] 4.2 Implement PUT /api/v1/configs/ai-provider endpoint
- [x] 4.3 Implement POST /api/v1/configs/ai-provider/test endpoint
- [x] 4.4 Update agent service to use user-specific AI config
- [x] 4.5 Support system default AI provider configuration

## 5. File Operations Backend

- [x] 5.1 Implement GET /api/v1/files endpoint (list files)
- [x] 5.2 Implement GET /api/v1/files/content endpoint (read file)
- [x] 5.3 Implement POST /api/v1/files/content endpoint (write file)
- [x] 5.4 Implement POST /api/v1/terminal/execute endpoint
- [x] 5.5 Add path validation to prevent directory traversal
- [x] 5.6 Add command whitelist for terminal execution

## 6. WebSocket Updates

- [x] 6.1 Update WebSocket server to authenticate connections
- [x] 6.2 Extract user_id from WebSocket connection token
- [x] 6.3 Ensure agent events are sent to correct user only
- [x] 6.4 Implement WebSocket reconnection logic on backend

## 7. Frontend Authentication

- [x] 7.1 Create Login page component
- [x] 7.2 Create Register page component
- [x] 7.3 Implement auth store (Zustand) for managing tokens
- [x] 7.4 Create API client with automatic token injection
- [x] 7.5 Implement token refresh logic in API client
- [x] 7.6 Create ProtectedRoute component for route guarding
- [x] 7.7 Add logout functionality

## 8. Frontend Core Changes

- [x] 8.1 Remove all Electron IPC calls from frontend
- [x] 8.2 Replace IPC calls with HTTP API calls
- [x] 8.3 Update WebSocket client to include auth token
- [x] 8.4 Create file service using HTTP API
- [x] 8.5 Update space store to work with new API
- [x] 8.6 Update conversation store to work with new API

## 9. Frontend UI Updates

- [x] 9.1 Create Settings > AI Provider page
- [x] 9.2 Create Settings > Profile page
- [x] 9.3 Create Admin Dashboard page
- [x] 9.4 Create Admin > User Management page
- [x] 9.5 Create Admin > System Config page
- [x] 9.6 Create Admin > Activity Logs page
- [x] 9.7 Update navigation to show admin link for admins

## 10. Build and Deployment

- [x] 10.1 Remove Electron dependencies from package.json
- [x] 10.2 Update Vite config for pure web build
- [x] 10.3 Update build scripts (remove electron-vite)
- [x] 10.4 Create Dockerfile for backend deployment
- [x] 10.5 Create docker-compose.yml for full stack
- [x] 10.6 Update README with new deployment instructions

## 11. Cleanup and Migration

- [x] 11.1 Remove src/main/ Electron code
- [x] 11.2 Remove src/preload/ directory
- [x] 11.3 Rename src/renderer/ to src/web/
- [x] 11.4 Update import paths after directory rename
- [x] 11.5 Test data migration on sample database
- [x] 11.6 Verify all specs are implemented
