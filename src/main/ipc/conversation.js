/**
 * Conversation IPC Handlers
 */
import { ipcMain } from 'electron';
import { listConversations, createConversation, getConversation, updateConversation, deleteConversation, addMessage, updateLastMessage, getMessageThoughts, toggleStarConversation } from '../services/conversation.service';
export function registerConversationHandlers() {
    // List conversations for a space
    ipcMain.handle('conversation:list', async (_event, spaceId) => {
        try {
            const conversations = listConversations(spaceId);
            return { success: true, data: conversations };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Create a new conversation
    ipcMain.handle('conversation:create', async (_event, spaceId, title) => {
        try {
            const conversation = createConversation(spaceId, title);
            return { success: true, data: conversation };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Get a specific conversation
    ipcMain.handle('conversation:get', async (_event, spaceId, conversationId) => {
        try {
            const conversation = getConversation(spaceId, conversationId);
            return { success: true, data: conversation };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Update a conversation
    ipcMain.handle('conversation:update', async (_event, spaceId, conversationId, updates) => {
        try {
            const conversation = updateConversation(spaceId, conversationId, updates);
            return { success: true, data: conversation };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Delete a conversation
    ipcMain.handle('conversation:delete', async (_event, spaceId, conversationId) => {
        try {
            const result = deleteConversation(spaceId, conversationId);
            return { success: true, data: result };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Add a message to a conversation
    ipcMain.handle('conversation:add-message', async (_event, spaceId, conversationId, message) => {
        try {
            const newMessage = addMessage(spaceId, conversationId, message);
            return { success: true, data: newMessage };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Update the last message (for saving content and thoughts)
    ipcMain.handle('conversation:update-last-message', async (_event, spaceId, conversationId, updates) => {
        try {
            const message = updateLastMessage(spaceId, conversationId, updates);
            return { success: true, data: message };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Get thoughts for a specific message (lazy loading)
    ipcMain.handle('conversation:get-thoughts', async (_event, spaceId, conversationId, messageId) => {
        try {
            const thoughts = getMessageThoughts(spaceId, conversationId, messageId);
            return { success: true, data: thoughts };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
    // Toggle starred status on a conversation
    ipcMain.handle('conversation:toggle-star', async (_event, spaceId, conversationId, starred) => {
        try {
            const meta = toggleStarConversation(spaceId, conversationId, starred);
            if (meta) {
                return { success: true, data: meta };
            }
            return { success: false, error: 'Conversation not found' };
        }
        catch (error) {
            const err = error;
            return { success: false, error: err.message };
        }
    });
}
//# sourceMappingURL=conversation.js.map