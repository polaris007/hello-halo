/**
 * Conversation Controller - Unified business logic for conversation operations
 * Used by both IPC handlers and HTTP routes
 */
import { listConversations as serviceListConversations, createConversation as serviceCreateConversation, getConversation as serviceGetConversation, updateConversation as serviceUpdateConversation, deleteConversation as serviceDeleteConversation, addMessage as serviceAddMessage, updateLastMessage as serviceUpdateLastMessage, getMessageThoughts as serviceGetMessageThoughts, toggleStarConversation as serviceToggleStarConversation } from '../services/conversation.service';
/**
 * List all conversations for a space
 */
export function listConversations(spaceId) {
    try {
        const conversations = serviceListConversations(spaceId);
        return { success: true, data: conversations };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Create a new conversation
 */
export function createConversation(spaceId, title) {
    try {
        const conversation = serviceCreateConversation(spaceId, title);
        return { success: true, data: conversation };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Get a specific conversation
 */
export function getConversation(spaceId, conversationId) {
    try {
        const conversation = serviceGetConversation(spaceId, conversationId);
        if (conversation) {
            return { success: true, data: conversation };
        }
        return { success: false, error: 'Conversation not found' };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Update a conversation
 */
export function updateConversation(spaceId, conversationId, updates) {
    try {
        const conversation = serviceUpdateConversation(spaceId, conversationId, updates);
        if (conversation) {
            return { success: true, data: conversation };
        }
        return { success: false, error: 'Failed to update conversation' };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Delete a conversation
 */
export function deleteConversation(spaceId, conversationId) {
    try {
        const result = serviceDeleteConversation(spaceId, conversationId);
        return { success: result };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Add a message to a conversation
 */
export function addMessage(spaceId, conversationId, message) {
    try {
        const newMessage = serviceAddMessage(spaceId, conversationId, message);
        return { success: true, data: newMessage };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Update the last message in a conversation
 */
export function updateLastMessage(spaceId, conversationId, updates) {
    try {
        const message = serviceUpdateLastMessage(spaceId, conversationId, updates);
        if (message) {
            return { success: true, data: message };
        }
        return { success: false, error: 'Failed to update message' };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Get thoughts for a specific message (lazy loading)
 */
export function getMessageThoughts(spaceId, conversationId, messageId) {
    try {
        const thoughts = serviceGetMessageThoughts(spaceId, conversationId, messageId);
        return { success: true, data: thoughts };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Toggle starred status on a conversation
 */
export function toggleStarConversation(spaceId, conversationId, starred) {
    try {
        const meta = serviceToggleStarConversation(spaceId, conversationId, starred);
        if (meta) {
            return { success: true, data: meta };
        }
        return { success: false, error: 'Conversation not found' };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=conversation.controller.js.map