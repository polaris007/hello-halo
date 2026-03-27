/**
 * Protocol Converters
 *
 * Handles conversion between:
 * - Anthropic Claude Messages API
 * - OpenAI Chat Completions API
 * - OpenAI Responses API
 */

// Request converters
export {
  convertAnthropicToOpenAIChat,
  convertRequest as convertRequestToChat
} from './request/anthropic-to-openai-chat.js'

export {
  convertAnthropicToOpenAIResponses,
  convertRequest as convertRequestToResponses
} from './request/anthropic-to-openai-responses.js'

// Response converters
export {
  convertOpenAIChatToAnthropic,
  convertResponse as convertChatResponseToAnthropic,
  createAnthropicErrorResponse,
  mapFinishReasonToStopReason
} from './response/openai-chat-to-anthropic.js'

export {
  convertOpenAIResponsesToAnthropic,
  convertResponse as convertResponsesResponseToAnthropic,
  mapStatusToStopReason
} from './response/openai-responses-to-anthropic.js'

// Content block converters
export * from './content-blocks.js'

// Message converters
export * from './messages.js'

// Tool converters
export * from './tools.js'

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

import { convertAnthropicToOpenAIChat } from './request/anthropic-to-openai-chat.js'
import { convertAnthropicToOpenAIResponses } from './request/anthropic-to-openai-responses.js'
import { convertOpenAIChatToAnthropic } from './response/openai-chat-to-anthropic.js'
import { convertOpenAIResponsesToAnthropic } from './response/openai-responses-to-anthropic.js'

import type { AnthropicRequest, OpenAIChatRequest, OpenAIResponsesRequest } from '../types/index.js'

/**
 * @deprecated Use convertAnthropicToOpenAIChat instead
 */
export function convertAnthropicToOpenAI(request: AnthropicRequest): OpenAIChatRequest {
  return convertAnthropicToOpenAIChat(request).request
}

/**
 * @deprecated Use convertOpenAIChatToAnthropic instead
 */
export function convertOpenAIToAnthropic(response: any, requestModel?: string) {
  return convertOpenAIChatToAnthropic(response, requestModel)
}

// Re-export with original names for compatibility
export { convertAnthropicToOpenAIResponses as convertToResponsesRequest }
export { convertOpenAIResponsesToAnthropic as convertFromResponsesResponse }
