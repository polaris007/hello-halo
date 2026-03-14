## 1. WebSocket Service Initialization

- [x] 1.1 Modify server entry point to initialize WebSocket service before Agent routes
- [x] 1.2 Inject WebSocket service into Agent helpers via `setWebSocketService`
- [x] 1.3 Verify WebSocket service is available when Agent sends events

## 2. WebSocket Event Broadcast

- [x] 2.1 Verify `broadcastAgentEvent` function correctly filters by conversation subscription
- [x] 2.2 Add logging for WebSocket event broadcast (debug level)
- [x] 2.3 Handle case when WebSocket service is not initialized (graceful fallback)

## 3. Frontend WebSocket Connection Management

- [x] 3.1 Verify `subscribeToConversation` is called after WebSocket connection is established
- [x] 3.2 Add connection state tracking in transport layer
- [x] 3.3 Ensure subscription messages are queued if sent before connection is ready

## 4. Frontend Event Handling

- [x] 4.1 Verify `onEvent` handlers in `chat.store.ts` correctly update conversation state
- [x] 4.2 Add debug logging for received WebSocket events
- [x] 4.3 Ensure `agent:complete` event correctly resets `isGenerating` state

## 5. Conversation Status Synchronization

- [x] 5.1 Verify `deriveTaskStatus` correctly determines conversation status from session state
- [x] 5.2 Ensure conversation list re-renders when session state changes
- [x] 5.3 Add status indicator component for conversation list items

## 6. Testing and Verification

- [ ] 6.1 Test complete message flow: send message → receive stream → complete
- [ ] 6.2 Test conversation status updates in left sidebar
- [ ] 6.3 Test multiple conversations with concurrent generation
- [ ] 6.4 Test WebSocket reconnection and event resumption
