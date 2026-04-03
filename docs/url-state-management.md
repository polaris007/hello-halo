# URL State Management

## Overview

This document describes the URL-based state management system implemented in Halo. The system ensures that users can refresh their browser without losing their conversation context, and enables sharing conversations via URL links.

## Features

### 1. URL-Based State Persistence

- **No localStorage fallback**: State is managed exclusively through URL parameters
- **Shareable URLs**: Users can share direct links to specific conversations
- **Browser navigation support**: Back/forward buttons work correctly

### 2. URL Structure

The application uses query parameters to track state:

```
/?spaceId=xxx&conversationId=yyy
```

- `spaceId`: The current workspace ID
- `conversationId`: The current conversation ID

### 3. Space Selection Page

The space selection page has a dedicated URL:

```
/spaces
```

This provides a clear entry point when no space is selected.

## Behavior

### Page Load

1. **URL with both spaceId and conversationId**
   - Validates both IDs
   - Loads the specified conversation
   - If conversation doesn't exist, creates a new one

2. **URL with only spaceId**
   - Validates the space ID
   - Creates a new conversation
   - Updates URL with the new conversationId

3. **URL with no parameters**
   - Checks authentication status
   - If authenticated: redirects to `/spaces`
   - If not authenticated: redirects to login page

4. **Invalid IDs**
   - Invalid spaceId: redirects to `/spaces`
   - Invalid conversationId: creates new conversation and updates URL

### Conversation Management

- **Creating new conversation**: URL is updated when conversation ID is assigned
- **Switching conversations**: URL is updated to reflect current conversation
- **Switching spaces**: URL is updated with new spaceId and conversationId

## Implementation Details

### URL Parameter Parsing

```typescript
const parseUrlParams = () => {
  const urlParams = new URLSearchParams(window.location.search)
  const spaceId = urlParams.get('spaceId')
  const conversationId = urlParams.get('conversationId')
  return { spaceId, conversationId }
}
```

### URL Parameter Updates

```typescript
const updateUrlParams = (spaceId: string | null, conversationId: string | null) => {
  const urlParams = new URLSearchParams()
  if (spaceId) urlParams.set('spaceId', spaceId)
  if (conversationId) urlParams.set('conversationId', conversationId)
  const search = urlParams.toString() ? `?${urlParams.toString()}` : ''

  // Use pushState to update URL without reloading
  window.history.pushState({}, '', `${window.location.pathname}${search}`)
}
```

## Browser Compatibility

The implementation uses standard Web APIs supported in all modern browsers:

- `URLSearchParams`: Chrome 49+, Firefox 44+, Safari 10.1+, Edge 17+
- `history.pushState`: Chrome 5+, Firefox 4+, Safari 5+, Edge 12+
- `URL` API: Chrome 19+, Firefox 26+, Safari 14+, Edge 12+

## Performance

- URL parsing: < 1ms
- URL updates: < 1ms per update
- State recovery: < 5ms
- No significant impact on page load times

## Testing

### Unit Tests

- `tests/unit/web/url-state.test.ts`: URL parameter parsing and updates
- `tests/unit/web/conversation-url-sync.test.ts`: Conversation creation and URL sync
- `tests/unit/web/url-state-performance.test.ts`: Performance benchmarks

### E2E Tests

- `tests/e2e/specs/page-refresh.spec.ts`: Page refresh and state restoration
- `tests/e2e/specs/space-selection-url.spec.ts`: Space selection page URL behavior

## Security Considerations

- No sensitive information is stored in URLs
- Space and conversation IDs are validated on the backend
- Authentication is checked before allowing access to spaces/conversations

## Migration Notes

### From localStorage to URL

Previously, the application used localStorage to persist the current space ID. This has been removed in favor of URL-based state management:

**Before:**
```typescript
// Store in localStorage
localStorage.setItem('halo_current_space_id', spaceId)

// Restore from localStorage
const spaceId = localStorage.getItem('halo_current_space_id')
```

**After:**
```typescript
// Store in URL
updateUrlParams(spaceId, conversationId)

// Restore from URL
const { spaceId, conversationId } = parseUrlParams()
```

## Future Enhancements

Potential improvements for the URL state management system:

1. **Deep linking to specific messages**: Add support for linking to specific messages within a conversation
2. **URL compression**: For very long conversation histories, consider URL compression
3. **Query parameter validation**: Add more robust validation for URL parameters
4. **Offline support**: Consider service worker caching for URL state