# AI Provider Config Spec

## ADDED Requirements

### Requirement: Store AI provider configuration
The system SHALL store AI provider configuration per user.

#### Scenario: Save Anthropic configuration
- **WHEN** a user saves Anthropic provider config with apiKey and model
- **THEN** the system stores the configuration in the database
- **AND** associates it with the user's id

#### Scenario: Save OpenAI configuration
- **WHEN** a user saves OpenAI provider config with apiKey and model
- **THEN** the system validates the apiKey format
- **AND** stores the configuration

#### Scenario: Save custom API configuration
- **WHEN** a user saves custom provider config with apiUrl, apiKey, and model
- **THEN** the system validates the apiUrl format
- **AND** stores the configuration

#### Scenario: Retrieve AI configuration
- **WHEN** a user requests their AI provider configuration
- **THEN** the system returns the configuration
- **AND** includes the full apiKey (internal deployment)

### Requirement: Configuration validation
The system SHALL validate AI provider configuration before saving.

#### Scenario: Validate API key format
- **WHEN** a user saves an Anthropic API key
- **THEN** the system validates it starts with "sk-"
- **AND** has valid length

#### Scenario: Test API connection
- **WHEN** a user saves configuration with "test_connection" flag
- **THEN** the system attempts a test API call
- **AND** returns success or error message

### Requirement: Fallback to system default
The system SHALL use system default configuration when user has no configuration.

#### Scenario: Use system default
- **WHEN** a user without personal config initiates an AI conversation
- **AND** system default is configured
- **THEN** the system uses the system default AI provider

#### Scenario: Error when no config available
- **WHEN** a user without personal config initiates an AI conversation
- **AND** no system default is configured
- **THEN** the system returns error "AI provider not configured"

### Requirement: Admin override
The system SHALL allow administrators to override user AI configuration.

#### Scenario: Admin sets user provider
- **WHEN** an admin updates a user's AI provider configuration
- **THEN** the system updates the user's config
- **AND** notifies the user of the change

#### Scenario: Lock user configuration
- **WHEN** an admin enables config lock for a user
- **THEN** the user cannot modify their AI provider settings
- **AND** the system returns 403 on modification attempts

## REMOVED Requirements

### Requirement: API Key encryption
**Reason**: Internal deployment scenario, simplified implementation with plaintext storage
**Migration**: API Keys are stored plaintext in database; ensure database file has proper filesystem permissions
