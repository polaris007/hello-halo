/**
 * Agent Module - Stream Processor
 *
 * Core stream processing logic extracted from send-message.ts.
 * Handles the V2 SDK session message stream including:
 * - Token-level streaming (text, thinking, tool_use blocks)
 * - Thought accumulation and tool result merging
 * - Session ID capture and MCP status broadcasting
 * - Token usage tracking
 * - Stream end handling with interrupt/error detection
 *
 * This module is caller-agnostic: both the main conversation agent
 * (send-message.ts) and the automation app runtime (execute.ts) use it,
 * providing caller-specific behavior via StreamCallbacks.
 */
import { is } from '@electron-toolkit/utils';
import { sendToRenderer } from './helpers';
import { parseSDKMessage, extractSingleUsage, extractResultUsage } from './message-utils';
import { broadcastMcpStatus } from './mcp-manager';
// Unified fallback error suffix - guides user to check logs
const FALLBACK_ERROR_HINT = 'Check logs in Settings > System > Logs.';
// ============================================
// Stream Processor
// ============================================
/**
 * Process the message stream from a V2 SDK session.
 *
 * This is the core streaming engine shared by both the main conversation agent
 * and the automation app runtime. It handles:
 * - Sending the message to the session
 * - Processing all stream_event types (thinking, text, tool_use blocks with deltas)
 * - Processing non-stream SDK messages (assistant, user, system, result)
 * - Emitting renderer events via sendToRenderer for real-time UI updates
 * - Token usage tracking (per-call and cumulative)
 * - Session ID capture from system/result messages
 * - MCP status broadcasting
 * - Stream end handling with the complete interrupt/error truth table
 *
 * @param params - All parameters needed for stream processing
 * @returns StreamResult with final content, thoughts, token usage, and status flags
 */
export async function processStream(params) {
    const { v2Session, sessionState, spaceId, conversationId, messageContent, displayModel, abortController, t0, callbacks } = params;
    // Only keep track of the LAST text block as the final reply
    // Intermediate text blocks are shown in thought process, not accumulated into message bubble
    let lastTextContent = '';
    let capturedSessionId;
    // Token usage tracking
    // lastSingleUsage: Last API call usage (single call, represents current context size)
    let lastSingleUsage = null;
    let tokenUsage = null;
    // Token-level streaming state
    let currentStreamingText = ''; // Accumulates text_delta tokens
    let isStreamingTextBlock = false; // True when inside a text content block
    const STREAM_THROTTLE_MS = 30; // Throttle updates to ~33fps
    // Track if SDK reported error_during_execution (for interrupted detection)
    let hadErrorDuringExecution = false;
    // Track if SDK reported error_max_turns (session hit the configured maxTurns limit)
    let hadMaxTurnsReached = false;
    // Track if we received a result message (for detecting stream interruption)
    let receivedResult = false;
    // Streaming block state - track active blocks by index for delta/stop correlation
    // Key: block index, Value: { type, thoughtId, content/partialJson }
    const streamingBlocks = new Map();
    // Tool ID to Thought ID mapping - for merging tool_result into tool_use
    const toolIdToThoughtId = new Map();
    const t1 = Date.now();
    console.log(`[Agent][${conversationId}] Sending message to V2 session...`);
    // Send message to V2 session and stream response
    // For multi-modal messages, we need to send as SDKUserMessage
    if (typeof messageContent === 'string') {
        v2Session.send(messageContent);
    }
    else {
        // Multi-modal message: construct SDKUserMessage
        const userMessage = {
            type: 'user',
            message: {
                role: 'user',
                content: messageContent
            }
        };
        v2Session.send(userMessage);
    }
    // Stream messages from V2 session
    for await (const sdkMessage of v2Session.stream()) {
        // Handle abort - check this session's controller
        if (abortController.signal.aborted) {
            console.log(`[Agent][${conversationId}] Aborted`);
            break;
        }
        // Notify caller of raw SDK message (for JSONL persistence in automation)
        if (callbacks.onRawMessage) {
            callbacks.onRawMessage(sdkMessage);
        }
        // Handle stream_event for token-level streaming (text only)
        if (sdkMessage.type === 'stream_event') {
            const event = sdkMessage.event;
            if (!event)
                continue;
            // DEBUG: Log all stream events with timestamp (ms since send)
            const elapsed = Date.now() - t1;
            // For message_start, log the full event to see if it contains content structure hints
            if (event.type === 'message_start') {
                if (is.dev) {
                    console.log(`[Agent][${conversationId}] 🔴 +${elapsed}ms message_start FULL:`, JSON.stringify(event));
                }
            }
            else {
                // console.log(`[Agent][${conversationId}] 🔴 +${elapsed}ms stream_event:`, JSON.stringify({
                //   type: event.type,
                //   index: event.index,
                //   content_block: event.content_block,
                //   delta: event.delta
                // }))
            }
            // Text block started
            if (event.type === 'content_block_start' && event.content_block?.type === 'text') {
                isStreamingTextBlock = true;
                currentStreamingText = event.content_block.text || '';
                // 🔑 Send precise signal for new text block (fixes truncation bug)
                // This is 100% reliable - comes directly from SDK's content_block_start event
                sendToRenderer('agent:message', spaceId, conversationId, {
                    type: 'message',
                    content: '',
                    isComplete: false,
                    isStreaming: false,
                    isNewTextBlock: true // Signal: new text block started
                });
            }
            // ========== Thinking block streaming ==========
            // Thinking block started - send empty thought immediately
            if (event.type === 'content_block_start' && event.content_block?.type === 'thinking') {
                const blockIndex = event.index ?? 0;
                const thoughtId = `thought-thinking-${Date.now()}-${blockIndex}`;
                // Track this block for delta correlation
                streamingBlocks.set(blockIndex, {
                    type: 'thinking',
                    thoughtId,
                    content: ''
                });
                // Create and send streaming thought immediately
                const thought = {
                    id: thoughtId,
                    type: 'thinking',
                    content: '',
                    timestamp: new Date().toISOString(),
                    isStreaming: true
                };
                // Add to session state
                sessionState.thoughts.push(thought);
                // Send to renderer for immediate display
                sendToRenderer('agent:thought', spaceId, conversationId, { thought });
            }
            // Thinking delta - append to thought content
            if (event.type === 'content_block_delta' && event.delta?.type === 'thinking_delta') {
                const blockIndex = event.index ?? 0;
                const blockState = streamingBlocks.get(blockIndex);
                if (blockState && blockState.type === 'thinking') {
                    const delta = event.delta.thinking || '';
                    blockState.content += delta;
                    // Send delta to renderer for incremental update
                    sendToRenderer('agent:thought-delta', spaceId, conversationId, {
                        thoughtId: blockState.thoughtId,
                        delta,
                        content: blockState.content // Also send full content for fallback
                    });
                }
            }
            // Text delta - accumulate locally, send delta to frontend
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && isStreamingTextBlock) {
                const delta = event.delta.text || '';
                currentStreamingText += delta;
                // Send delta immediately without throttling
                sendToRenderer('agent:message', spaceId, conversationId, {
                    type: 'message',
                    delta,
                    isComplete: false,
                    isStreaming: true
                });
            }
            // ========== Tool use block streaming ==========
            // Tool use block started - send thought with tool name immediately
            if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
                const blockIndex = event.index ?? 0;
                const toolId = event.content_block.id || `tool-${Date.now()}`;
                const toolName = event.content_block.name || 'Unknown';
                const thoughtId = `thought-tool-${Date.now()}-${blockIndex}`;
                // Track this block for delta correlation
                streamingBlocks.set(blockIndex, {
                    type: 'tool_use',
                    thoughtId,
                    content: '', // Will accumulate partial JSON
                    toolName,
                    toolId
                });
                // Create and send streaming tool thought immediately
                const thought = {
                    id: thoughtId,
                    type: 'tool_use',
                    content: '',
                    timestamp: new Date().toISOString(),
                    toolName,
                    toolInput: {}, // Empty initially, will be populated on stop
                    isStreaming: true,
                    isReady: false // Params not complete yet
                };
                // Add to session state
                sessionState.thoughts.push(thought);
                // Send to renderer for immediate display (shows tool name, "准备中...")
                sendToRenderer('agent:thought', spaceId, conversationId, { thought });
            }
            // Tool use input JSON delta - accumulate partial JSON
            if (event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') {
                const blockIndex = event.index ?? 0;
                const blockState = streamingBlocks.get(blockIndex);
                if (blockState && blockState.type === 'tool_use') {
                    const partialJson = event.delta.partial_json || '';
                    blockState.content += partialJson;
                    // Send delta to renderer (for progress indication, not for parsing)
                    sendToRenderer('agent:thought-delta', spaceId, conversationId, {
                        thoughtId: blockState.thoughtId,
                        delta: partialJson,
                        isToolInput: true // Flag: this is tool input JSON, not thinking text
                    });
                }
            }
            // ========== Block stop handling ==========
            // content_block_stop - finalize streaming blocks
            if (event.type === 'content_block_stop') {
                const blockIndex = event.index ?? 0;
                const blockState = streamingBlocks.get(blockIndex);
                if (blockState) {
                    if (blockState.type === 'thinking') {
                        // Thinking block complete - send final state
                        sendToRenderer('agent:thought-delta', spaceId, conversationId, {
                            thoughtId: blockState.thoughtId,
                            content: blockState.content,
                            isComplete: true // Signal: thinking is complete
                        });
                        // Update session state thought
                        const thought = sessionState.thoughts.find((t) => t.id === blockState.thoughtId);
                        if (thought) {
                            thought.content = blockState.content;
                            thought.isStreaming = false;
                        }
                        console.log(`[Agent][${conversationId}] Thinking block complete, length: ${blockState.content.length}`);
                    }
                    else if (blockState.type === 'tool_use') {
                        // Tool use block complete - parse JSON and send final state
                        let toolInput = {};
                        try {
                            if (blockState.content) {
                                toolInput = JSON.parse(blockState.content);
                            }
                        }
                        catch (e) {
                            console.error(`[Agent][${conversationId}] Failed to parse tool input JSON:`, e);
                        }
                        // Record mapping for merging tool_result later
                        if (blockState.toolId) {
                            toolIdToThoughtId.set(blockState.toolId, blockState.thoughtId);
                        }
                        // Send complete signal with parsed input
                        sendToRenderer('agent:thought-delta', spaceId, conversationId, {
                            thoughtId: blockState.thoughtId,
                            toolInput,
                            isComplete: true, // Signal: tool params are complete
                            isReady: true, // Tool is ready for execution
                            isToolInput: true // Flag: this is tool input completion (triggers isReady update in frontend)
                        });
                        // Update session state thought
                        const thought = sessionState.thoughts.find((t) => t.id === blockState.thoughtId);
                        if (thought) {
                            thought.toolInput = toolInput;
                            thought.isStreaming = false;
                            thought.isReady = true;
                        }
                        // Send tool-call event for tool approval/tracking
                        // This replaces the event that was previously sent from parseSDKMessage
                        const toolCall = {
                            id: blockState.toolId || blockState.thoughtId,
                            name: blockState.toolName || '',
                            status: 'running',
                            input: toolInput
                        };
                        sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall);
                        if (is.dev) {
                            console.log(`[Agent][${conversationId}] Tool block complete [${blockState.toolName}], input: ${JSON.stringify(toolInput).substring(0, 100)}`);
                        }
                    }
                    // Clean up tracking state
                    streamingBlocks.delete(blockIndex);
                }
                // Handle text block stop (existing logic)
                if (isStreamingTextBlock) {
                    isStreamingTextBlock = false;
                    // Send final content of this block
                    sendToRenderer('agent:message', spaceId, conversationId, {
                        type: 'message',
                        content: currentStreamingText,
                        isComplete: false,
                        isStreaming: false
                    });
                    // Update lastTextContent for final result
                    lastTextContent = currentStreamingText;
                    console.log(`[Agent][${conversationId}] Text block completed, length: ${currentStreamingText.length}`);
                }
            }
            continue; // stream_event handled, skip normal processing
        }
        // DEBUG: Log all SDK messages with timestamp
        const elapsed = Date.now() - t1;
        console.log(`[Agent] SDK messages [${conversationId}] 🔵 +${elapsed}ms ${sdkMessage.type}:`, JSON.stringify(sdkMessage, null, 2));
        // Extract single API call usage from assistant message (represents current context size)
        if (sdkMessage.type === 'assistant') {
            const usage = extractSingleUsage(sdkMessage);
            if (usage) {
                lastSingleUsage = usage;
            }
        }
        // Parse SDK message into Thought and send to renderer
        // Pass credentials.model to display the user's actual configured model
        const thought = parseSDKMessage(sdkMessage, displayModel);
        if (thought) {
            // Handle tool_result specially - merge into corresponding tool_use thought
            if (thought.type === 'tool_result') {
                const toolUseThoughtId = toolIdToThoughtId.get(thought.id);
                if (toolUseThoughtId) {
                    // Found corresponding tool_use - merge result into it
                    const toolResult = {
                        output: thought.toolOutput || '',
                        isError: thought.isError || false,
                        timestamp: thought.timestamp
                    };
                    // Update backend session state
                    const toolUseThought = sessionState.thoughts.find((t) => t.id === toolUseThoughtId);
                    if (toolUseThought) {
                        toolUseThought.toolResult = toolResult;
                    }
                    // Send thought-delta to merge result into tool_use on frontend
                    sendToRenderer('agent:thought-delta', spaceId, conversationId, {
                        thoughtId: toolUseThoughtId,
                        toolResult,
                        isToolResult: true // Flag: this is a tool result merge
                    });
                    // Still send tool-result event for any listeners
                    sendToRenderer('agent:tool-result', spaceId, conversationId, {
                        type: 'tool_result',
                        toolId: thought.id,
                        result: thought.toolOutput || '',
                        isError: thought.isError || false
                    });
                    console.log(`[Agent][${conversationId}] Tool result merged into thought ${toolUseThoughtId}`);
                }
                else {
                    // No mapping found - fall back to separate thought (shouldn't happen normally)
                    sessionState.thoughts.push(thought);
                    sendToRenderer('agent:thought', spaceId, conversationId, { thought });
                    sendToRenderer('agent:tool-result', spaceId, conversationId, {
                        type: 'tool_result',
                        toolId: thought.id,
                        result: thought.toolOutput || '',
                        isError: thought.isError || false
                    });
                    console.log(`[Agent][${conversationId}] Tool result fallback (no mapping): ${thought.id}`);
                }
            }
            else {
                // Non tool_result thoughts - handle normally
                // Accumulate thought in backend session (Single Source of Truth)
                sessionState.thoughts.push(thought);
                // Send ALL thoughts to renderer for real-time display in thought process area
                // This includes text blocks - they appear in the timeline during generation
                sendToRenderer('agent:thought', spaceId, conversationId, { thought });
                // Handle specific thought types
                if (thought.type === 'text') {
                    // Keep only the latest text block (overwritten by each new text block)
                    // This becomes the final reply when generation completes
                    // Intermediate texts stay in the thought process area only
                    lastTextContent = thought.content;
                    // Send streaming update - frontend shows this during generation
                    sendToRenderer('agent:message', spaceId, conversationId, {
                        type: 'message',
                        content: lastTextContent,
                        isComplete: false
                    });
                }
                else if (thought.type === 'tool_use') {
                    // Send tool call event
                    const toolCall = {
                        id: thought.id,
                        name: thought.toolName || '',
                        status: 'running',
                        input: thought.toolInput || {}
                    };
                    sendToRenderer('agent:tool-call', spaceId, conversationId, toolCall);
                }
                else if (thought.type === 'error') {
                    // SDK reported an error (rate_limit, authentication_failed, etc.)
                    // Send error to frontend - user should see the actual error from provider
                    console.log(`[Agent][${conversationId}] Error thought received: ${thought.content}`);
                    sendToRenderer('agent:error', spaceId, conversationId, {
                        type: 'error',
                        error: thought.content,
                        errorCode: thought.errorCode // Preserve error code for debugging
                    });
                }
                else if (thought.type === 'result') {
                    // Final result - use the last text block as the final reply
                    const finalContent = lastTextContent || thought.content;
                    sendToRenderer('agent:message', spaceId, conversationId, {
                        type: 'message',
                        content: finalContent,
                        isComplete: true
                    });
                    // Fallback: if no text block was received, use result content for persistence
                    if (!lastTextContent && thought.content) {
                        lastTextContent = thought.content;
                    }
                    // Note: updateLastMessage is called after loop to include tokenUsage
                    console.log(`[Agent][${conversationId}] Result thought received, ${sessionState.thoughts.length} thoughts accumulated`);
                }
            }
        }
        // Capture session ID and MCP status from system/result messages
        // Use type assertion for SDK message properties that may vary
        const msg = sdkMessage;
        if (sdkMessage.type === 'system') {
            const subtype = msg.subtype;
            const sessionIdFromMsg = msg.session_id || msg.message?.session_id;
            if (sessionIdFromMsg) {
                capturedSessionId = sessionIdFromMsg;
                console.log(`[Agent][${conversationId}] Captured session ID:`, capturedSessionId);
            }
            // Handle compact_boundary - context compression notification
            if (subtype === 'compact_boundary') {
                const compactMetadata = msg.compact_metadata;
                if (compactMetadata) {
                    console.log(`[Agent][${conversationId}] Context compressed: trigger=${compactMetadata.trigger}, pre_tokens=${compactMetadata.pre_tokens}`);
                    // Send compact notification to renderer
                    sendToRenderer('agent:compact', spaceId, conversationId, {
                        type: 'compact',
                        trigger: compactMetadata.trigger,
                        preTokens: compactMetadata.pre_tokens
                    });
                }
            }
            // Extract MCP server status from system init message
            // SDKSystemMessage includes mcp_servers: { name: string; status: string }[]
            const mcpServers = msg.mcp_servers;
            if (mcpServers && mcpServers.length > 0) {
                if (is.dev) {
                    console.log(`[Agent][${conversationId}] MCP server status:`, JSON.stringify(mcpServers));
                }
                // Broadcast MCP status to frontend (global event, not conversation-specific)
                broadcastMcpStatus(mcpServers);
            }
            // Also capture tools list if available
            const tools = msg.tools;
            if (tools) {
                console.log(`[Agent][${conversationId}] Available tools: ${tools.length}`);
            }
        }
        else if (sdkMessage.type === 'result') {
            receivedResult = true; // Mark that we received a result message
            if (!capturedSessionId) {
                const sessionIdFromMsg = msg.session_id || msg.message?.session_id;
                capturedSessionId = sessionIdFromMsg;
            }
            // Check for error_during_execution (interrupted) vs real errors
            // Note: Real API errors (is_error=true) are already handled by parseSDKMessage above
            // which creates an error thought and triggers agent:error via the thought.type === 'error' branch
            const isError = sdkMessage.is_error === true;
            if (isError) {
                const errors = sdkMessage.errors;
                console.log(`[Agent][${conversationId}] ⚠️ SDK error (is_error=${isError}, errors=${errors?.length || 0}): ${(sdkMessage.result || '').substring(0, 200)}`);
            }
            else if (sdkMessage.subtype === 'error_during_execution') {
                // Mark as interrupted - will be used for empty response handling
                hadErrorDuringExecution = true;
                console.log(`[Agent][${conversationId}] SDK result subtype=error_during_execution but is_error=false, errors=[] - marked as interrupted`);
            }
            else if (sdkMessage.subtype === 'error_max_turns') {
                // Session hit the configured maxTurns limit - this is a graceful SDK termination,
                // not an error. Track it so we can show a clear message instead of "empty response".
                hadMaxTurnsReached = true;
                console.log(`[Agent][${conversationId}] SDK result subtype=error_max_turns, num_turns=${sdkMessage.num_turns} - session reached turn limit`);
            }
            // Extract token usage from result message
            tokenUsage = extractResultUsage(msg, lastSingleUsage);
            if (tokenUsage) {
                console.log(`[Agent][${conversationId}] Token usage (single API):`, tokenUsage);
            }
        }
    }
    // ========== Stream End Handling ==========
    //
    // Error conditions (truth table):
    // | Case | hasContent | isInterrupted | hasErrorThought | wasAborted | reachedMaxTurns | Send error?      |
    // |------|------------|---------------|-----------------|------------|-----------------|------------------|
    // | 1a   | yes        | -             | -               | yes        | -               | stopped by user  |
    // | 1b   | yes        | yes           | -               | no         | -               | interrupted      |
    // | 2    | yes        | no            | -               | no         | -               | no               |
    // | 3    | no         | yes           | no              | no         | -               | interrupted      |
    // | 4    | no         | no            | no              | no         | no              | empty response   |
    // | 5    | no         | -             | yes             | -          | -               | no               |
    // | 6    | no         | -             | -               | yes        | -               | no               |
    // | 7    | no         | no            | no              | no         | yes             | max turns notice |
    // Merge content: prefer lastTextContent (confirmed), fallback to currentStreamingText (accumulated)
    const finalContent = lastTextContent || currentStreamingText || '';
    const wasAborted = abortController.signal.aborted;
    const hasErrorThought = sessionState.thoughts.some((t) => t.type === 'error');
    // Two independent interrupt reasons: SDK reported error_during_execution, or stream ended unexpectedly
    const isInterrupted = !receivedResult || hadErrorDuringExecution;
    // Find the error thought for callers
    const errorThought = hasErrorThought
        ? sessionState.thoughts.find((t) => t.type === 'error')
        : undefined;
    // Log content source for debugging
    if (finalContent) {
        const contentSource = lastTextContent ? 'lastTextContent' : 'currentStreamingText (fallback)';
        console.log(`[Agent][${conversationId}] Stream content from ${contentSource}: ${finalContent.length} chars`);
    }
    else {
        console.log(`[Agent][${conversationId}] No content from stream`);
    }
    if (hasErrorThought) {
        console.log(`[Agent][${conversationId}] Error thought present: ${errorThought?.content}`);
    }
    // Build the result object
    const result = {
        finalContent,
        thoughts: sessionState.thoughts,
        tokenUsage,
        capturedSessionId,
        isInterrupted,
        wasAborted,
        hasErrorThought,
        errorThought,
        reachedMaxTurns: hadMaxTurnsReached
    };
    // Notify caller for storage handling
    callbacks.onComplete(result);
    // Always send complete event to unblock frontend
    sendToRenderer('agent:complete', spaceId, conversationId, {
        type: 'complete',
        duration: 0,
        tokenUsage
    });
    // Determine if interrupted error should be sent
    const getInterruptedErrorMessage = () => {
        if (finalContent) {
            // Has content: user aborted shows friendly message, other interrupts show warning
            if (wasAborted)
                return 'Stopped by user.';
            return isInterrupted ? 'Model response interrupted unexpectedly.' : null;
        }
        else {
            // No content: skip if already has error thought or user aborted
            if (hasErrorThought || wasAborted)
                return null;
            // Max turns is a graceful SDK limit, not a crash — show a clear actionable message
            if (hadMaxTurnsReached)
                return 'Reached the maximum turn limit. Send a message to continue.';
            return isInterrupted
                ? 'Model response interrupted unexpectedly.'
                : `Unexpected empty response. ${FALLBACK_ERROR_HINT}`;
        }
    };
    const errorMessage = getInterruptedErrorMessage();
    if (errorMessage) {
        const reason = hadMaxTurnsReached
            ? 'max_turns'
            : isInterrupted
                ? (hadErrorDuringExecution ? 'error_during_execution' : 'stream interrupted')
                : 'empty response';
        console.log(`[Agent][${conversationId}] Sending interrupted error (${reason}, content: ${finalContent ? 'yes' : 'no'})`);
        sendToRenderer('agent:error', spaceId, conversationId, {
            type: 'error',
            errorType: 'interrupted',
            error: errorMessage
        });
    }
    else if (wasAborted) {
        console.log(`[Agent][${conversationId}] User stopped - no error sent`);
    }
    return result;
}
//# sourceMappingURL=stream-processor.js.map