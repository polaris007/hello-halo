## ADDED Requirements

### Requirement: Session state tracking
The system SHALL track per-conversation session state including generation status.

#### Scenario: Generation starts
- **WHEN** a user sends a message to a conversation
- **THEN** the system SHALL create or update the session state
- **AND** the session state SHALL mark `isGenerating` as true

#### Scenario: Generation completes
- **WHEN** an Agent completes processing for a conversation
- **THEN** the system SHALL update the session state
- **AND** the session state SHALL mark `isGenerating` as false

#### Scenario: Generation errors
- **WHEN** an Agent encounters an error during processing
- **THEN** the system SHALL update the session state
- **AND** the session state SHALL store the error information

### Requirement: Conversation list status display
The system SHALL display real-time status for each conversation in the conversation list.

#### Scenario: Conversation is generating
- **GIVEN** a conversation has `isGenerating` status
- **WHEN** the conversation list is displayed
- **THEN** the conversation SHALL show a "Generating..." indicator

#### Scenario: Conversation has error
- **GIVEN** a conversation has an error status
- **WHEN** the conversation list is displayed
- **THEN** the conversation SHALL show an error indicator

#### Scenario: Conversation is waiting for approval
- **GIVEN** a conversation has a pending tool approval
- **WHEN** the conversation list is displayed
- **THEN** the conversation SHALL show a "Waiting..." indicator

### Requirement: Cross-tab status synchronization
The system SHALL synchronize conversation status across multiple browser tabs.

#### Scenario: Multiple tabs open
- **GIVEN** a user has multiple tabs open with the same conversation
- **WHEN** the conversation status changes in one tab
- **THEN** all other tabs SHALL reflect the updated status
