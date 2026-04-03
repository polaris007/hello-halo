# Page State Persistence Specification

## Purpose
*TBD: Define the purpose of page state persistence capability*

This specification defines the requirements for implementing page state persistence in the Halo application, specifically focusing on the dialogue page. The goal is to ensure that when users refresh the browser, they can continue their conversation without losing context, using only URL parameters for state management.

## Requirements

### 1. URL State Management

**Requirement 1.1:** The application must support URL parameters for state management, using the format `?spaceId=xxx&conversationId=yyy`.

**Requirement 1.2:** The application must update URL parameters when the user switches spaces or conversations.

**Requirement 1.3:** The application must support sharing conversations via URL links.

**Requirement 1.4:** The application must provide a dedicated URL for the space selection page, such as `/spaces`.

### 2. State Recovery

**Requirement 2.1:** Upon page load, the application must check for URL parameters to restore state.

**Requirement 2.2:** If URL parameters exist, the application must restore the state from the URL, including:
- Selecting the specified space
- Loading the specified conversation
- Restoring the conversation context

**Requirement 2.3:** If URL parameters are missing or invalid, the application must:
- Check authentication status
- If not authenticated, redirect to login page
- If authenticated, redirect to space selection page

### 3. Conversation Selection Strategy

**Requirement 3.1:** When URL contains space ID but no conversation ID, the application must create a new conversation.

**Requirement 3.2:** When user sends a message in a newly created conversation and gets a conversation ID, the application must update the URL with the conversation ID.

**Requirement 3.3:** The application must ensure that the conversation selection process is consistent and predictable.

### 4. Performance

**Requirement 4.1:** The state recovery process must not significantly impact page load times.

**Requirement 4.2:** The URL parameter management must be optimized to avoid unnecessary page reloads.

### 5. Reliability

**Requirement 5.1:** The application must ensure state consistency between the frontend and backend, syncing data when necessary.

**Requirement 5.2:** The application must handle URL parameter errors gracefully, providing clear user feedback.

### 6. Boundary Case Handling

**Requirement 6.1:** When URL parameters are missing, the application must:
- Check authentication status
- If not authenticated, redirect to login page
- If authenticated, redirect to space selection page

**Requirement 6.2:** When URL parameters are present but invalid, the application must:
- If space ID is invalid, redirect to space selection page
- If conversation ID is invalid, create a new conversation and update the URL

**Requirement 6.3:** When authentication token is invalid or expired, the application must redirect to login page regardless of other URL parameters.

## Implementation Guidelines

### 1. URL State Management

- Implement URL parameter parsing using the browser's `URLSearchParams` API
- Update URL parameters when switching spaces or conversations using `history.pushState`
- Ensure URL updates are done without page reloads
- Implement a dedicated URL for the space selection page

### 2. State Recovery Flow

1. On page load, check URL parameters for spaceId and conversationId
2. If URL parameters exist, validate their integrity and restore state from URL
3. If spaceId is present but conversationId is missing, create a new conversation
4. If no URL parameters exist or spaceId is invalid:
   - Check authentication status
   - If not authenticated, redirect to login page
   - If authenticated, redirect to space selection page
5. If conversationId is invalid, create a new conversation and update the URL
6. Fetch any missing data from the backend
7. Update the UI to reflect the restored state

### 3. URL Update Mechanism

1. When user switches spaces, update the URL with the new spaceId
2. When user selects a conversation, update the URL with the new conversationId
3. When user sends a message in a newly created conversation, update the URL with the new conversationId
4. Use `history.pushState` to update URL without page reload
5. Ensure URL updates are consistent and reflect the current state

### 4. Data Structure

```typescript
// URL parameters structure
// ?spaceId=xxx&conversationId=yyy

// Space selection page URL
// /spaces
```

### 5. Error Handling

- Implement try-catch blocks around URL parameter operations
- Provide clear user feedback for invalid URL parameters
- Log errors for debugging purposes

## Testing

### 1. Unit Tests

- Test URL parameter parsing and state recovery
- Test conversation creation when no conversation ID is present
- Test error handling scenarios

### 2. Integration Tests

- Test the complete flow from state recovery to URL update
- Test with different browser refresh scenarios
- Test with multiple conversations and spaces
- Test URL sharing functionality
- Test space selection page URL

### 3. Performance Tests

- Measure page load times with different URL parameter scenarios
- Test with large conversation histories

## Security Considerations

- Do not store sensitive information in URL parameters
- Implement proper error handling to prevent security vulnerabilities
- Validate URL parameters on the backend to prevent unauthorized access