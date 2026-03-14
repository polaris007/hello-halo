# SaaS Architecture Migration - Tasks

## 1. Backend Authentication

- [ ] 1.1 Create users table migration script
- [ ] 1.2 Implement password hashing utility (bcryptjs)
- [ ] 1.3 Implement JWT token generation and validation
- [ ] 1.4 Create auth middleware for protecting routes
- [ ] 1.5 Implement POST /api/v1/auth/register endpoint
- [ ] 1.6 Implement POST /api/v1/auth/login endpoint
- [ ] 1.7 Implement POST /api/v1/auth/refresh endpoint
- [ ] 1.8 Implement POST /api/v1/auth/logout endpoint
- [ ] 1.9 Implement POST /api/v1/auth/change-password endpoint

## 2. Multi-Tenancy Backend

- [ ] 2.1 Add user_id column to spaces table
- [ ] 2.2 Add user_id column to conversations table
- [ ] 2.3 Add user_id column to configs table
- [ ] 2.4 Update space service to filter by user_id
- [ ] 2.5 Update conversation service to filter by user_id
- [ ] 2.6 Update config service to filter by user_id
- [ ] 2.7 Create data migration script for existing data
- [ ] 2.8 Update all API routes to extract user_id from JWT

## 3. Admin Backend

- [ ] 3.1 Implement GET /api/v1/admin/users endpoint
- [ ] 3.2 Implement POST /api/v1/admin/users endpoint
- [ ] 3.3 Implement PUT /api/v1/admin/users/:id endpoint
- [ ] 3.4 Implement DELETE /api/v1/admin/users/:id endpoint
- [ ] 3.5 Implement GET /api/v1/admin/config endpoint
- [ ] 3.6 Implement PUT /api/v1/admin/config endpoint
- [ ] 3.7 Implement GET /api/v1/admin/activity endpoint
- [ ] 3.8 Create admin role middleware

## 4. AI Provider Configuration Backend

- [ ] 4.1 Implement GET /api/v1/configs/ai-provider endpoint
- [ ] 4.2 Implement PUT /api/v1/configs/ai-provider endpoint
- [ ] 4.3 Implement POST /api/v1/configs/ai-provider/test endpoint
- [ ] 4.4 Update agent service to use user-specific AI config
- [ ] 4.5 Support system default AI provider configuration

## 5. File Operations Backend

- [ ] 5.1 Implement GET /api/v1/files endpoint (list files)
- [ ] 5.2 Implement GET /api/v1/files/content endpoint (read file)
- [ ] 5.3 Implement POST /api/v1/files/content endpoint (write file)
- [ ] 5.4 Implement POST /api/v1/terminal/execute endpoint
- [ ] 5.5 Add path validation to prevent directory traversal
- [ ] 5.6 Add command whitelist for terminal execution

## 6. WebSocket Updates

- [ ] 6.1 Update WebSocket server to authenticate connections
- [ ] 6.2 Extract user_id from WebSocket connection token
- [ ] 6.3 Ensure agent events are sent to correct user only
- [ ] 6.4 Implement WebSocket reconnection logic on backend

## 7. Frontend Authentication

- [ ] 7.1 Create Login page component
- [ ] 7.2 Create Register page component
- [ ] 7.3 Implement auth store (Zustand) for managing tokens
- [ ] 7.4 Create API client with automatic token injection
- [ ] 7.5 Implement token refresh logic in API client
- [ ] 7.6 Create ProtectedRoute component for route guarding
- [ ] 7.7 Add logout functionality

## 8. Frontend Core Changes

- [ ] 8.1 Remove all Electron IPC calls from frontend
- [ ] 8.2 Replace IPC calls with HTTP API calls
- [ ] 8.3 Update WebSocket client to include auth token
- [ ] 8.4 Create file service using HTTP API
- [ ] 8.5 Update space store to work with new API
- [ ] 8.6 Update conversation store to work with new API

## 9. Frontend UI Updates

- [ ] 9.1 Create Settings > AI Provider page
- [ ] 9.2 Create Settings > Profile page
- [ ] 9.3 Create Admin Dashboard page
- [ ] 9.4 Create Admin > User Management page
- [ ] 9.5 Create Admin > System Config page
- [ ] 9.6 Create Admin > Activity Logs page
- [ ] 9.7 Update navigation to show admin link for admins

## 10. Build and Deployment

- [ ] 10.1 Remove Electron dependencies from package.json
- [ ] 10.2 Update Vite config for pure web build
- [ ] 10.3 Update build scripts (remove electron-vite)
- [ ] 10.4 Create Dockerfile for backend deployment
- [ ] 10.5 Create docker-compose.yml for full stack
- [ ] 10.6 Update README with new deployment instructions

## 11. Cleanup and Migration

- [ ] 11.1 Remove src/main/ Electron code
- [ ] 11.2 Remove src/preload/ directory
- [ ] 11.3 Rename src/renderer/ to src/web/
- [ ] 11.4 Update import paths after directory rename
- [ ] 11.5 Test data migration on sample database
- [ ] 11.6 Verify all specs are implemented
