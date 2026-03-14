/**
 * OpenAI Chat Completions API - Complete Type Definitions
 * Based on: https://platform.openai.com/docs/api-reference/chat
 */
// ============================================================================
// Type Guards
// ============================================================================
export function isSystemMessage(msg) {
    return msg.role === 'system';
}
export function isUserMessage(msg) {
    return msg.role === 'user';
}
export function isAssistantMessage(msg) {
    return msg.role === 'assistant';
}
export function isToolMessage(msg) {
    return msg.role === 'tool';
}
export function isTextPart(part) {
    return part.type === 'text';
}
export function isImagePart(part) {
    return part.type === 'image_url';
}
export function hasToolCalls(msg) {
    return Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0;
}
//# sourceMappingURL=openai-chat.js.map