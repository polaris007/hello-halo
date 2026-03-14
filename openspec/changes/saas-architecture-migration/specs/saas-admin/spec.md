# SaaS Admin Spec

## ADDED Requirements

### Requirement: User management
The system SHALL allow administrators to manage users.

#### Scenario: List all users
- **WHEN** an admin sends GET request to /api/v1/admin/users
- **THEN** the system returns a paginated list of all users
- **AND** includes user id, email, name, role, created_at, last_login

#### Scenario: Create new user
- **WHEN** an admin sends POST request to /api/v1/admin/users with user details
- **THEN** the system creates a new user account
- **AND** returns the created user object

#### Scenario: Update user
- **WHEN** an admin sends PUT request to /api/v1/admin/users/:id
- **THEN** the system updates the user's information
- **AND** returns the updated user object

#### Scenario: Delete user
- **WHEN** an admin sends DELETE request to /api/v1/admin/users/:id
- **THEN** the system soft-deletes the user (marks as inactive)
- **AND** preserves all user data for audit

#### Scenario: Non-admin access denied
- **WHEN** a non-admin user tries to access /api/v1/admin/* endpoints
- **THEN** the system returns 403 Forbidden error

### Requirement: System configuration
The system SHALL allow administrators to configure system-wide settings.

#### Scenario: Get system config
- **WHEN** an admin requests GET /api/v1/admin/config
- **THEN** the system returns system-wide configuration
- **AND** includes default AI provider, rate limits, feature flags

#### Scenario: Update system config
- **WHEN** an admin sends PUT /api/v1/admin/config
- **THEN** the system validates and updates configuration
- **AND** applies changes immediately

### Requirement: User activity monitoring
The system SHALL provide activity logs for administrators.

#### Scenario: View activity logs
- **WHEN** an admin requests GET /api/v1/admin/activity
- **THEN** the system returns recent user activity logs
- **AND** includes action type, user_id, timestamp, details

#### Scenario: Filter activity by user
- **WHEN** an admin requests activity with user_id filter
- **THEN** the system returns only activity for the specified user

#### Scenario: Filter activity by date range
- **WHEN** an admin requests activity with start_date and end_date
- **THEN** the system returns activity within the date range

### Requirement: Default AI provider configuration
The system SHALL allow administrators to set default AI provider for new users.

#### Scenario: Set default AI provider
- **WHEN** an admin configures system default AI provider
- **THEN** the system stores the default configuration
- **AND** new users inherit this configuration on registration

#### Scenario: Lock AI provider settings
- **WHEN** an admin enables "lock_ai_config" setting
- **THEN** regular users cannot modify their AI provider settings
- **AND** all users use the system default
