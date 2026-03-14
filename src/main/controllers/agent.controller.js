/**
 * Agent Controller - Unified business logic for agent operations
 * Used by both IPC handlers and HTTP routes
 */
import { sendMessage as agentSendMessage, stopGeneration as agentStopGeneration, isGenerating, getActiveSessions, getSessionState as agentGetSessionState, testMcpConnections as agentTestMcpConnections, resolveQuestion } from '../services/agent';
/**
 * Send a message to the agent
 */
export async function sendMessage(mainWindow, request) {
    try {
        await agentSendMessage(mainWindow, request);
        return { success: true };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Stop generation for a specific conversation or all
 */
export function stopGeneration(conversationId) {
    try {
        agentStopGeneration(conversationId);
        return { success: true };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Approve tool execution - no-op (all permissions auto-allowed)
 */
export function approveTool(_conversationId) {
    return { success: true };
}
/**
 * Reject tool execution - no-op (all permissions auto-allowed)
 */
export function rejectTool(_conversationId) {
    return { success: true };
}
/**
 * Check if a conversation is currently generating
 */
export function checkGenerating(conversationId) {
    try {
        return { success: true, data: isGenerating(conversationId) };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Get all active session conversation IDs
 */
export function listActiveSessions() {
    try {
        return { success: true, data: getActiveSessions() };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Get current session state for recovery after refresh
 */
export function getSessionState(conversationId) {
    try {
        return { success: true, data: agentGetSessionState(conversationId) };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Answer a pending AskUserQuestion
 */
export function answerQuestion(conversationId, id, answers) {
    try {
        const resolved = resolveQuestion(id, answers);
        if (!resolved) {
            return { success: false, error: `No pending question found for id: ${id}` };
        }
        return { success: true };
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
/**
 * Test MCP server connections
 */
export async function testMcpConnections(mainWindow) {
    try {
        const result = await agentTestMcpConnections(mainWindow);
        return result;
    }
    catch (error) {
        const err = error;
        return { success: false, error: err.message };
    }
}
//# sourceMappingURL=agent.controller.js.map