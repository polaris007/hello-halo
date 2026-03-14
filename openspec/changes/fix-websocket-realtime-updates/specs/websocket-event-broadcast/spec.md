## ADDED Requirements

### Requirement: WebSocket service initialization
The system SHALL initialize WebSocket service and inject it into Agent helpers during server startup.

#### Scenario: Server startup
- **WHEN** the server starts
- **THEN** the WebSocket service SHALL be initialized
- **AND** the service instance SHALL be injected into Agent helpers via `setWebSocketService`

### Requirement: Conversation subscription
The system SHALL support conversation-level event subscription via WebSocket.

#### Scenario: Client subscribes to conversation
- **WHEN** a client sends a `subscribe` message with `conversationId` via WebSocket
- **THEN** the system SHALL record the subscription relationship
- **AND** the client SHALL receive a `subscribed` confirmation message

#### Scenario: Client unsubscribes from conversation
- **WHEN** a client sends an `unsubscribe` message with `conversationId` via WebSocket
- **THEN** the system SHALL remove the subscription relationship

### Requirement: Agent event broadcast
The system SHALL broadcast Agent events only to clients subscribed to the relevant conversation.

#### Scenario: Agent message event
- **WHEN** an Agent generates a message event for a conversation
- **THEN** the system SHALL broadcast the event via WebSocket
- **AND** only clients subscribed to that conversation SHALL receive the event

#### Scenario: Agent thought event
- **WHEN** an Agent generates a thought event for a conversation
- **THEN** the system SHALL broadcast the event via WebSocket
- **AND** only clients subscribed to that conversation SHALL receive the event

#### Scenario: Agent complete event
- **WHEN** an Agent completes processing for a conversation
- **THEN** the system SHALL broadcast the `agent:complete` event via WebSocket
- **AND** only clients subscribed to that conversation SHALL receive the event

### Requirement: Event data format
The system SHALL use consistent event format for all Agent events.

#### Scenario: Event structure
- **WHEN** broadcasting an Agent event
- **THEN** the event SHALL have format: `{ type: 'agent:event', payload: { eventType, data: { ..., spaceId, conversationId } } }`
