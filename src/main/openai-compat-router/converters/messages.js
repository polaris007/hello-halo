/**
 * Message Array Converters
 *
 * Handles conversion of message arrays between different API formats
 */
import { anthropicBlockToOpenAIChatPart, anthropicToolUseToOpenAIChatToolCall, anthropicBlockToResponsesInputPart, anthropicToolUseToResponsesFunctionCall, anthropicToolResultToResponsesFunctionCallOutput, extractTextFromAnthropicBlocks, extractToolUseBlocks, extractToolResultBlocks } from './content-blocks';
import { deepClone } from '../utils';
/**
 * Convert Anthropic system prompt to OpenAI Chat system message
 */
export function convertAnthropicSystemToOpenAIChat(system) {
    if (!system)
        return null;
    if (typeof system === 'string') {
        return { role: 'system', content: system };
    }
    if (Array.isArray(system) && system.length > 0) {
        const textBlocks = system.filter((block) => block?.type === 'text' && block.text);
        if (textBlocks.length === 0)
            return null;
        // If all blocks are plain text, return as content parts
        // Note: cache_control is Anthropic-specific, strip it for OpenAI format
        const contentParts = textBlocks.map((block) => ({
            type: 'text',
            text: block.text
        }));
        return { role: 'system', content: contentParts };
    }
    return null;
}
/**
 * Convert Anthropic messages array to OpenAI Chat messages
 */
export function convertAnthropicMessagesToOpenAIChat(messages, system) {
    const result = [];
    let hasImages = false;
    // Add system message if present
    const systemMessage = convertAnthropicSystemToOpenAIChat(system);
    if (systemMessage) {
        result.push(systemMessage);
    }
    if (!messages || !Array.isArray(messages)) {
        return { messages: result, hasImages };
    }
    // Deep clone to avoid mutation
    const msgsCopy = deepClone(messages);
    for (const msg of msgsCopy) {
        if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) {
            continue;
        }
        // Handle string content
        if (typeof msg.content === 'string') {
            result.push({ role: msg.role, content: msg.content });
            continue;
        }
        if (!Array.isArray(msg.content)) {
            continue;
        }
        const blocks = msg.content;
        if (msg.role === 'user') {
            // Extract tool_result blocks -> convert to tool messages
            const toolResults = extractToolResultBlocks(blocks);
            for (const toolResult of toolResults) {
                const content = typeof toolResult.content === 'string'
                    ? toolResult.content
                    : JSON.stringify(toolResult.content);
                const toolMessage = {
                    role: 'tool',
                    content,
                    tool_call_id: toolResult.tool_use_id
                };
                result.push(toolMessage);
            }
            // Convert remaining content blocks (text, image)
            const contentBlocks = blocks.filter((b) => (b.type === 'text' && b.text) || (b.type === 'image' && b.source));
            if (contentBlocks.length > 0) {
                const openaiContent = [];
                for (const block of contentBlocks) {
                    if (block.type === 'image') {
                        hasImages = true;
                    }
                    const converted = anthropicBlockToOpenAIChatPart(block);
                    if (converted) {
                        openaiContent.push(converted);
                    }
                }
                if (openaiContent.length > 0) {
                    result.push({ role: 'user', content: openaiContent });
                }
            }
        }
        else if (msg.role === 'assistant') {
            // Extract text and tool_use blocks
            const text = extractTextFromAnthropicBlocks(blocks);
            const toolUseBlocks = extractToolUseBlocks(blocks);
            // Extract thinking blocks for reasoning_content (required by some providers like Moonshot)
            const thinkingBlocks = blocks.filter((b) => b.type === 'thinking');
            const thinkingContent = thinkingBlocks
                .map((b) => b.thinking)
                .filter(Boolean)
                .join('\n');
            const assistantMessage = {
                role: 'assistant',
                content: text || null // OpenAI expects null for pure tool_calls
            };
            // Add reasoning_content if thinking blocks exist
            // This is required by providers like Moonshot when reasoning is enabled
            if (thinkingContent) {
                assistantMessage.reasoning_content = thinkingContent;
            }
            if (toolUseBlocks.length > 0) {
                assistantMessage.tool_calls = toolUseBlocks.map(anthropicToolUseToOpenAIChatToolCall);
            }
            result.push(assistantMessage);
        }
    }
    return { messages: result, hasImages };
}
// ============================================================================
// Anthropic -> OpenAI Responses
// ============================================================================
/**
 * Convert Anthropic system prompt to OpenAI Responses input item
 * Note: Responses API uses 'developer' role instead of 'system' for system-level instructions
 */
export function convertAnthropicSystemToResponsesInput(system) {
    if (!system)
        return null;
    let sysText;
    if (typeof system === 'string') {
        sysText = system;
    }
    else if (Array.isArray(system) && system.length > 0) {
        const textParts = system
            .filter((b) => b?.type === 'text' && b.text)
            .map((b) => b.text);
        sysText = textParts.join('\n');
    }
    else {
        return null;
    }
    if (!sysText)
        return null;
    // Use 'system' role for compatibility (some providers don't support 'developer')
    return {
        role: 'system',
        content: [{ type: 'input_text', text: sysText }]
    };
}
/**
 * Convert Anthropic messages array to OpenAI Responses input items
 */
export function convertAnthropicMessagesToResponsesInput(messages, system) {
    const result = [];
    // Add system message if present
    const systemMessage = convertAnthropicSystemToResponsesInput(system);
    if (systemMessage) {
        result.push(systemMessage);
    }
    if (!messages || !Array.isArray(messages)) {
        return result;
    }
    // Deep clone to avoid mutation
    const msgsCopy = deepClone(messages);
    for (const msg of msgsCopy) {
        if (!msg || (msg.role !== 'user' && msg.role !== 'assistant')) {
            continue;
        }
        // Handle string content
        if (typeof msg.content === 'string') {
            const contentType = msg.role === 'user' ? 'input_text' : 'output_text';
            result.push({
                role: msg.role,
                content: [{ type: contentType, text: msg.content }]
            });
            continue;
        }
        if (!Array.isArray(msg.content)) {
            continue;
        }
        const blocks = msg.content;
        if (msg.role === 'user') {
            // Process tool_result blocks -> function_call_output items
            const toolResults = extractToolResultBlocks(blocks);
            for (const toolResult of toolResults) {
                result.push(anthropicToolResultToResponsesFunctionCallOutput(toolResult));
            }
            // Convert other content blocks
            const contentParts = [];
            for (const block of blocks) {
                if (block.type !== 'tool_result') {
                    const converted = anthropicBlockToResponsesInputPart(block, 'user');
                    if (converted) {
                        contentParts.push(converted);
                    }
                }
            }
            if (contentParts.length > 0) {
                result.push({
                    role: 'user',
                    content: contentParts
                });
            }
        }
        else if (msg.role === 'assistant') {
            // Convert text and thinking content
            const contentParts = [];
            for (const block of blocks) {
                if (block.type !== 'tool_use') {
                    const converted = anthropicBlockToResponsesInputPart(block, 'assistant');
                    if (converted) {
                        contentParts.push(converted);
                    }
                }
            }
            if (contentParts.length > 0) {
                result.push({
                    role: 'assistant',
                    content: contentParts
                });
            }
            // Convert tool_use blocks -> function_call items
            const toolUseBlocks = extractToolUseBlocks(blocks);
            for (const toolUse of toolUseBlocks) {
                result.push(anthropicToolUseToResponsesFunctionCall(toolUse));
            }
        }
    }
    return result;
}
//# sourceMappingURL=messages.js.map