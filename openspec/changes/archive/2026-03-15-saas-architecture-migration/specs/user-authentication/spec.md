# User Authentication Spec

## ADDED Requirements

### Requirement: User registration
The system SHALL allow new users to register with email and password.

#### Scenario: Successful registration
- **WHEN** a new user submits registration form with valid email and password
- **THEN** the system creates a new user account
- **AND** returns a JWT access token and refresh token

#### Scenario: Duplicate email registration
- **WHEN** a user tries to register with an email that already exists
- **THEN** the system returns a 409 Conflict error with message "Email already registered"

#### Scenario: Invalid email format
- **WHEN** a user submits registration with invalid email format
- **THEN** the system returns a 400 Bad Request error with validation details

#### Scenario: Weak password
- **WHEN** a user submits registration with password shorter than 8 characters
- **THEN** the system returns a 400 Bad Request error with message "Password must be at least 8 characters"

### Requirement: User login
The system SHALL authenticate users with email and password and issue JWT tokens.

#### Scenario: Successful login
- **WHEN** a user submits correct email and password
- **THEN** the system returns a JWT access token (valid for 1 hour) and refresh token (valid for 7 days)
- **AND** returns user profile information

#### Scenario: Invalid credentials
- **WHEN** a user submits incorrect email or password
- **THEN** the system returns a 401 Unauthorized error with message "Invalid credentials"
- **AND** does not reveal whether email exists

#### Scenario: Account locked
- **WHEN** a user fails login 5 times within 15 minutes
- **THEN** the system locks the account for 30 minutes
- **AND** returns 423 Locked error

### Requirement: Token refresh
The system SHALL allow users to refresh their access token using a refresh token.

#### Scenario: Successful token refresh
- **WHEN** a user sends a valid refresh token to /api/v1/auth/refresh
- **THEN** the system returns a new access token
- **AND** returns a new refresh token (rotation)

#### Scenario: Expired refresh token
- **WHEN** a user sends an expired refresh token
- **THEN** the system returns a 401 Unauthorized error
- **AND** requires user to login again

#### Scenario: Revoked refresh token
- **WHEN** a user sends a refresh token that has been revoked (after logout)
- **THEN** the system returns a 401 Unauthorized error

### Requirement: User logout
The system SHALL allow users to logout and invalidate their tokens.

#### Scenario: Successful logout
- **WHEN** an authenticated user sends logout request
- **THEN** the system invalidates the refresh token
- **AND** blacklists the current access token until expiration

### Requirement: Password change
The system SHALL allow authenticated users to change their password.

#### Scenario: Successful password change
- **WHEN** an authenticated user provides current password and new password
- **THEN** the system validates current password
- **AND** updates the password hash
- **AND** invalidates all existing refresh tokens

#### Scenario: Wrong current password
- **WHEN** a user provides incorrect current password
- **THEN** the system returns 400 Bad Request error with message "Current password is incorrect"

### Requirement: JWT authentication middleware
The system SHALL validate JWT tokens on protected API endpoints.

#### Scenario: Valid token
- **WHEN** a request includes a valid JWT access token in Authorization header
- **THEN** the system extracts user_id from token
- **AND** attaches user context to the request
- **AND** allows access to the endpoint

#### Scenario: Missing token
- **WHEN** a request to protected endpoint does not include Authorization header
- **THEN** the system returns 401 Unauthorized error

#### Scenario: Invalid token
- **WHEN** a request includes an invalid or malformed JWT token
- **THEN** the system returns 401 Unauthorized error

#### Scenario: Expired token
- **WHEN** a request includes an expired JWT access token
- **THEN** the system returns 401 Unauthorized error with code "TOKEN_EXPIRED"
