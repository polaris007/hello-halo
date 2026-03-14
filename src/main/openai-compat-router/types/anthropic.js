/**
 * Claude Messages API (Anthropic) - Complete Type Definitions
 * Based on: https://docs.anthropic.com/en/api/messages
 */
// ============================================================================
// Type Guards
// ============================================================================
export function isTextBlock(block) {
    return block.type === 'text';
}
export function isImageBlock(block) {
    return block.type === 'image';
}
export function isToolUseBlock(block) {
    return block.type === 'tool_use';
}
export function isToolResultBlock(block) {
    return block.type === 'tool_result';
}
export function isThinkingBlock(block) {
    return block.type === 'thinking';
}
export function isBase64ImageSource(source) {
    return source.type === 'base64';
}
export function isURLImageSource(source) {
    return source.type === 'url';
}
//# sourceMappingURL=anthropic.js.map