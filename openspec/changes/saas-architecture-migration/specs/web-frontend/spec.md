# Web Frontend Spec

## ADDED Requirements

### Requirement: Authentication pages
The system SHALL provide login and registration pages.

#### Scenario: Login page
- **WHEN** an unauthenticated user accesses the application
- **THEN** the system redirects to the login page
- **AND** the page contains email and password fields
- **AND** includes a link to registration page

#### Scenario: Registration page
- **WHEN** a user clicks "Register" link
- **THEN** the system displays registration form
- **AND** includes email, password, confirm password fields
- **AND** validates input before submission

#### Scenario: Post-login redirect
- **WHEN** a user successfully logs in
- **THEN** the system stores the JWT token in localStorage
- **AND** redirects to the main application page
- **AND** loads user's spaces and conversations

### Requirement: API client with authentication
The system SHALL provide an authenticated API client for all backend calls.

#### Scenario: Include token in requests
- **WHEN** the frontend makes an API call
- **THEN** the client includes Authorization header with Bearer token
- **AND** sends request to /api/v1/* endpoints

#### Scenario: Handle token expiration
- **WHEN** the API returns 401 with "TOKEN_EXPIRED" code
- **THEN** the client attempts to refresh the token
- **AND** retries the original request

#### Scenario: Redirect on auth failure
- **WHEN** token refresh fails
- **THEN** the client redirects to login page
- **AND** clears stored tokens

### Requirement: Remove Electron dependencies
The system SHALL remove all Electron-specific code.

#### Scenario: Remove IPC calls
- **WHEN** the application initializes
- **THEN** no code calls window.electron.ipcRenderer
- **AND** all IPC calls are replaced with HTTP API calls

#### Scenario: Remove preload references
- **WHEN** the application runs in browser
- **THEN** no code references window.electron
- **AND** all Electron APIs are replaced with web equivalents

#### Scenario: File operations via API
- **WHEN** the user performs a file operation
- **THEN** the frontend calls /api/v1/files/* endpoints
- **AND** does not use Node.js fs module

### Requirement: Real-time updates via WebSocket
The system SHALL use WebSocket for real-time updates.

#### Scenario: Connect to WebSocket
- **WHEN** the application loads
- **THEN** the frontend establishes WebSocket connection to /ws
- **AND** includes JWT token in connection handshake

#### Scenario: Receive agent events
- **WHEN** the backend sends an agent event
- **THEN** the frontend receives it via WebSocket
- **AND** updates the UI accordingly

#### Scenario: Reconnect on disconnect
- **WHEN** the WebSocket connection drops
- **THEN** the frontend attempts to reconnect with exponential backoff
- **AND** resumes receiving events after reconnection

### Requirement: User settings page
The system SHALL provide a settings page for user configuration.

#### Scenario: AI provider settings
- **WHEN** a user navigates to Settings > AI Provider
- **THEN** the page displays current AI provider configuration
- **AND** allows editing provider, model, apiKey
- **AND** includes "Test Connection" button

#### Scenario: Profile settings
- **WHEN** a user navigates to Settings > Profile
- **THEN** the page displays user information
- **AND** allows changing name and password

### Requirement: Admin dashboard
The system SHALL provide an admin dashboard for administrators.

#### Scenario: Access admin dashboard
- **WHEN** an admin user clicks "Admin" in navigation
- **THEN** the system displays admin dashboard
- **AND** includes user management, system config, activity logs

#### Scenario: Non-admin access denied
- **WHEN** a non-admin user tries to access /admin routes
- **THEN** the system redirects to the main page
- **AND** shows "Access denied" message

## REMOVED Requirements

### Requirement: AI Browser
**Reason**: Browser environment cannot embed BrowserView for web automation
**Migration**: Use backend-based web scraping or remove the feature

### Requirement: Artifact preview
**Reason**: Complex to implement in pure web environment
**Migration**: Use simple file content display instead of rich preview

### Requirement: Native system integration
**Reason**: Browser cannot access native system APIs
**Migration**: Features like global hotkey, system tray are not available in web version
