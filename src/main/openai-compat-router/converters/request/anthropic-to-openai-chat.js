/**
 * Request Converter: Anthropic -> OpenAI Chat Completions
 */
import { convertAnthropicMessagesToOpenAIChat } from '../messages';
import { convertAnthropicToolsToOpenAIChat, convertAnthropicToolChoiceToOpenAIChat, convertAnthropicThinkingToOpenAIReasoning } from '../tools';
/**
 * Convert Anthropic request to OpenAI Chat Completions request
 */
export function convertAnthropicToOpenAIChat(anthropicRequest) {
    // Convert messages
    const { messages, hasImages } = convertAnthropicMessagesToOpenAIChat(anthropicRequest.messages, anthropicRequest.system);
    // Convert tools - just filter invalid ones, don't reject all
    const tools = convertAnthropicToolsToOpenAIChat(anthropicRequest.tools);
    // Build OpenAI request - only include essential parameters
    // Omit max_tokens/temperature as providers have their own defaults
    const openaiRequest = {
        model: anthropicRequest.model,
        messages,
        stream: anthropicRequest.stream
    };
    // Add tools if present
    if (tools && tools.length > 0) {
        openaiRequest.tools = tools;
        openaiRequest.tool_choice = convertAnthropicToolChoiceToOpenAIChat(anthropicRequest.tool_choice);
    }
    // Convert thinking -> reasoning
    if (anthropicRequest.thinking) {
        openaiRequest.reasoning = convertAnthropicThinkingToOpenAIReasoning(anthropicRequest.thinking);
    }
    return {
        request: openaiRequest,
        hasImages,
        hasTools: !!tools && tools.length > 0
    };
}
/**
 * Simplified conversion that returns just the request
 * (for backward compatibility)
 */
export function convertRequest(anthropicRequest) {
    return convertAnthropicToOpenAIChat(anthropicRequest).request;
}
//# sourceMappingURL=anthropic-to-openai-chat.js.map