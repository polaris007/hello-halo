## MODIFIED Requirements

### Requirement: Agent event broadcast mechanism
The Agent service SHALL use WebSocket service for broadcasting events to clients.

#### Scenario: Stream message event
- **WHEN** the Agent receives a text delta from the AI SDK
- **THEN** the Agent SHALL call `sendToRenderer` with `agent:message` event
- **AND** `sendToRenderer` SHALL broadcast via WebSocket service

#### Scenario: Thought event
- **WHEN** the Agent parses a thought from the AI SDK
- **THEN** the Agent SHALL call `sendToRenderer` with `agent:thought` event
- **AND** `sendToRenderer` SHALL broadcast via WebSocket service

#### Scenario: Complete event
- **WHEN** the Agent finishes processing a message
- **THEN** the Agent SHALL call `sendToRenderer` with `agent:complete` event
- **AND** `sendToRenderer` SHALL broadcast via WebSocket service

#### Scenario: Error event
- **WHEN** the Agent encounters an error during processing
- **THEN** the Agent SHALL call `sendToRenderer` with `agent:error` event
- **AND** `sendToRenderer` SHALL broadcast via WebSocket service

## ADDED Requirements

### Requirement: WebSocket service availability check
The Agent service SHALL handle cases where WebSocket service is not initialized.

#### Scenario: WebSocket not initialized
- **GIVEN** the WebSocket service is not initialized
- **WHEN** the Agent tries to broadcast an event
- **THEN** the system SHALL log a warning
- **AND** the Agent processing SHALL continue without error
