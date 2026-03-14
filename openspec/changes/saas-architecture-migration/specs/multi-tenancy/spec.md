# Multi-Tenancy Spec

## ADDED Requirements

### Requirement: User data isolation
The system SHALL ensure users can only access data belonging to them.

#### Scenario: Space access isolation
- **WHEN** user A tries to access a space belonging to user B
- **THEN** the system returns 403 Forbidden error
- **AND** logs the access attempt

#### Scenario: Conversation access isolation
- **WHEN** user A tries to read conversations from user B's space
- **THEN** the system returns 403 Forbidden error

#### Scenario: Config access isolation
- **WHEN** user A tries to read or modify user B's AI provider configuration
- **THEN** the system returns 403 Forbidden error

### Requirement: Admin user access
The system SHALL allow admin users to access all users' data.

#### Scenario: Admin accesses user space
- **WHEN** an admin user tries to access any user's space
- **THEN** the system allows the access
- **AND** logs the admin access for audit

#### Scenario: Admin lists all users
- **WHEN** an admin user requests the user list
- **THEN** the system returns all users in the system

### Requirement: Data ownership on creation
The system SHALL automatically assign ownership to the authenticated user when creating resources.

#### Scenario: Create space with ownership
- **WHEN** an authenticated user creates a new space
- **THEN** the system sets the space's user_id to the current user's id
- **AND** the space is only accessible by the owner (or admin)

#### Scenario: Create conversation with ownership
- **WHEN** an authenticated user creates a conversation
- **THEN** the system sets the conversation's user_id to the current user's id

#### Scenario: Save config with ownership
- **WHEN** an authenticated user saves AI provider configuration
- **THEN** the system stores the config with the user's id
- **AND** overwrites any existing config for that user

### Requirement: Database query filtering
The system SHALL automatically filter database queries by user_id.

#### Scenario: List spaces filtered by user
- **WHEN** a user requests their space list
- **THEN** the system executes query with `WHERE user_id = ?` clause
- **AND** returns only spaces belonging to the user

#### Scenario: Get conversation filtered by user
- **WHEN** a user requests a specific conversation
- **THEN** the system queries with `WHERE id = ? AND user_id = ?`
- **AND** returns 404 if conversation belongs to another user

### Requirement: Migration of existing data
The system SHALL migrate existing data to the multi-tenant model on first startup.

#### Scenario: First startup migration
- **WHEN** the system starts for the first time after upgrade
- **AND** detects existing data without user_id
- **THEN** the system creates a default admin user
- **AND** assigns all existing data to the admin user
- **AND** logs the migration completion

#### Scenario: Fresh installation
- **WHEN** the system starts on a fresh installation
- **THEN** the system creates the database schema with user_id columns
- **AND** no migration is needed
