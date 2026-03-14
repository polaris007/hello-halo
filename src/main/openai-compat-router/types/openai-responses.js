/**
 * OpenAI Responses API - Complete Type Definitions
 * Based on: https://platform.openai.com/docs/api-reference/responses
 */
// ============================================================================
// Type Guards
// ============================================================================
export function isInputMessage(item) {
    return 'role' in item;
}
export function isFunctionCall(item) {
    return 'type' in item && item.type === 'function_call';
}
export function isFunctionCallOutput(item) {
    return 'type' in item && item.type === 'function_call_output';
}
export function isMessageOutput(item) {
    return item.type === 'message';
}
export function isFunctionCallOutput2(item) {
    return item.type === 'function_call';
}
export function isReasoningOutput(item) {
    return item.type === 'reasoning';
}
export function isInputText(part) {
    return part.type === 'input_text';
}
export function isInputImage(part) {
    return part.type === 'input_image';
}
export function isOutputText(part) {
    return part.type === 'output_text';
}
export function isRefusal(part) {
    return part.type === 'refusal';
}
export function isFunctionTool(tool) {
    return tool.type === 'function';
}
//# sourceMappingURL=openai-responses.js.map