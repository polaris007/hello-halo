/**
 * Stream Handlers
 *
 * Converts OpenAI streaming responses to Anthropic SSE format
 */

// SSE Writer
export { SSEWriter, type SSEWriterOptions } from './sse-writer.js'

// Base handler
export {
  BaseStreamHandler,
  createInitialState,
  OPENAI_CHAT_STOP_REASON_MAP,
  OPENAI_RESPONSES_STOP_REASON_MAP,
  type StreamState,
  type StreamHandlerOptions
} from './base-stream-handler.js'

// OpenAI Chat Completions stream handler
export {
  OpenAIChatStreamHandler,
  streamOpenAIChatToAnthropic
} from './openai-chat-stream.js'

// OpenAI Responses API stream handler
export {
  OpenAIResponsesStreamHandler,
  streamOpenAIResponsesToAnthropic
} from './openai-responses-stream.js'

// ============================================================================
// Backward Compatibility Aliases
// ============================================================================

import { streamOpenAIChatToAnthropic } from './openai-chat-stream.js'
import { streamOpenAIResponsesToAnthropic } from './openai-responses-stream.js'

/**
 * @deprecated Use streamOpenAIChatToAnthropic instead
 */
export const streamOpenAIToAnthropic = streamOpenAIChatToAnthropic
