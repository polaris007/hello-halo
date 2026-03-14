/**
 * Base Stream Handler
 *
 * Provides shared functionality for stream conversion:
 * - State management
 * - Block lifecycle management
 * - SSE parsing utilities
 */
import { Readable } from 'node:stream';
import { SSEWriter } from './sse-writer';
export function createInitialState(model) {
    return {
        started: false,
        finished: false,
        messageId: `msg_${Date.now()}`,
        model,
        currentBlockIndex: -1,
        contentBlockIndex: 0,
        hasTextBlock: false,
        hasThinkingBlock: false,
        reasoningClosed: false,
        usage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0
        },
        stopReason: null,
        accumulatedText: '',
        accumulatedThinking: ''
    };
}
export class BaseStreamHandler {
    writer;
    state;
    debug;
    // Tool call tracking
    toolCallMap = new Map();
    toolIndexToBlock = new Map();
    constructor(res, options = {}) {
        this.writer = new SSEWriter(res, { debug: options.debug });
        this.state = createInitialState(options.model || 'unknown');
        this.debug = options.debug ?? false;
    }
    // ============================================================================
    // State Management
    // ============================================================================
    get isFinished() {
        return this.state.finished || this.writer.isClosed;
    }
    markFinished() {
        this.state.finished = true;
    }
    updateModel(model) {
        if (model) {
            this.state.model = model;
        }
    }
    updateUsage(usage) {
        if (usage.inputTokens !== undefined) {
            this.state.usage.inputTokens = usage.inputTokens;
        }
        if (usage.outputTokens !== undefined) {
            this.state.usage.outputTokens = usage.outputTokens;
        }
        if (usage.cacheReadTokens !== undefined) {
            this.state.usage.cacheReadTokens = usage.cacheReadTokens;
        }
    }
    // ============================================================================
    // Message Lifecycle
    // ============================================================================
    ensureMessageStarted() {
        if (this.isFinished)
            return false;
        if (!this.state.started) {
            this.state.started = true;
            return this.writer.writeMessageStart(this.state.messageId, this.state.model);
        }
        return true;
    }
    finishMessage() {
        // Only check if writer is closed, not if state is finished
        // (state.finished is set when finish_reason is received, but we still need to send final events)
        if (this.writer.isClosed)
            return;
        // Debug: print accumulated content
        if (this.state.accumulatedThinking) {
            console.log(`[StreamHandler] Accumulated thinking:\n${this.state.accumulatedThinking}`);
        }
        if (this.state.accumulatedText) {
            console.log(`[StreamHandler] Accumulated text:\n${this.state.accumulatedText}`);
        }
        // Close any open block
        this.closeCurrentBlock();
        // Write message_delta
        this.writer.writeMessageDelta(this.state.stopReason || 'end_turn', {
            inputTokens: this.state.usage.inputTokens,
            outputTokens: this.state.usage.outputTokens,
            cacheReadTokens: this.state.usage.cacheReadTokens
        });
        // Write message_stop
        this.writer.writeMessageStop();
        // End response
        this.writer.end();
        this.state.finished = true;
    }
    // ============================================================================
    // Block Lifecycle
    // ============================================================================
    closeCurrentBlock() {
        if (this.state.currentBlockIndex >= 0) {
            this.writer.writeBlockStop(this.state.currentBlockIndex);
            this.state.currentBlockIndex = -1;
        }
    }
    startTextBlock() {
        if (this.isFinished)
            return false;
        if (!this.state.hasTextBlock) {
            // Close any previous block (e.g., thinking)
            if (this.state.currentBlockIndex >= 0) {
                this.closeCurrentBlock();
            }
            this.state.hasTextBlock = true;
            this.writer.writeTextBlockStart(this.state.contentBlockIndex);
            this.state.currentBlockIndex = this.state.contentBlockIndex;
            return true;
        }
        return true;
    }
    startThinkingBlock() {
        if (this.isFinished)
            return false;
        if (!this.state.hasThinkingBlock) {
            // Close any previous block
            if (this.state.currentBlockIndex >= 0) {
                this.closeCurrentBlock();
            }
            this.state.hasThinkingBlock = true;
            this.writer.writeThinkingBlockStart(this.state.contentBlockIndex);
            this.state.currentBlockIndex = this.state.contentBlockIndex;
            return true;
        }
        return true;
    }
    startToolUseBlock(toolIndex, toolId, toolName) {
        if (this.isFinished)
            return -1;
        // Check if we already have a block for this tool index
        if (this.toolIndexToBlock.has(toolIndex)) {
            return this.toolIndexToBlock.get(toolIndex);
        }
        // Close any current block
        this.closeCurrentBlock();
        const blockIndex = this.state.contentBlockIndex;
        this.toolIndexToBlock.set(toolIndex, blockIndex);
        this.state.contentBlockIndex++;
        this.writer.writeToolUseBlockStart(blockIndex, toolId, toolName);
        this.state.currentBlockIndex = blockIndex;
        // Track tool state
        this.toolCallMap.set(toolIndex, {
            id: toolId,
            name: toolName,
            arguments: '',
            contentBlockIndex: blockIndex
        });
        return blockIndex;
    }
    // ============================================================================
    // Content Writing
    // ============================================================================
    writeTextDelta(text) {
        if (this.isFinished || !text)
            return;
        // Accumulate text for debug logging
        this.state.accumulatedText += text;
        // Close thinking block if open and start text block
        this.state.reasoningClosed = true;
        if (!this.state.hasTextBlock) {
            if (this.state.currentBlockIndex >= 0 && !this.state.hasTextBlock) {
                this.closeCurrentBlock();
            }
            this.startTextBlock();
        }
        this.writer.writeTextDelta(this.state.currentBlockIndex, text);
    }
    writeThinkingDelta(thinking) {
        if (this.isFinished || !thinking)
            return;
        // Accumulate thinking for debug logging
        this.state.accumulatedThinking += thinking;
        // Don't write thinking if we've already moved to text
        if (this.state.reasoningClosed || this.state.hasTextBlock)
            return;
        if (!this.state.hasThinkingBlock) {
            this.startThinkingBlock();
        }
        this.writer.writeThinkingDelta(this.state.contentBlockIndex, thinking);
    }
    writeSignatureDelta(signature) {
        if (this.isFinished || !signature)
            return;
        if (this.state.hasThinkingBlock) {
            this.writer.writeSignatureDelta(this.state.contentBlockIndex, signature);
            // Close thinking block and move to next
            this.closeCurrentBlock();
            this.state.contentBlockIndex++;
        }
    }
    writeToolInputDelta(toolIndex, partialJson) {
        if (this.isFinished || !partialJson)
            return;
        const blockIndex = this.toolIndexToBlock.get(toolIndex);
        if (blockIndex === undefined)
            return;
        // Update accumulated arguments
        const state = this.toolCallMap.get(toolIndex);
        if (state) {
            state.arguments += partialJson;
        }
        // Try to write the delta, with fallback for invalid characters
        try {
            this.writer.writeInputJsonDelta(blockIndex, partialJson);
        }
        catch {
            try {
                // Escape problematic characters
                const escaped = String(partialJson)
                    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"');
                this.writer.writeInputJsonDelta(blockIndex, escaped);
            }
            catch (e) {
                if (this.debug) {
                    console.error('[BaseStreamHandler] Failed to write tool input delta:', e);
                }
            }
        }
    }
    writeWebSearchResult(toolUseId, results) {
        if (this.isFinished)
            return;
        // Close current block if needed
        if (this.state.currentBlockIndex >= 0 && this.state.hasTextBlock) {
            this.closeCurrentBlock();
            this.state.hasTextBlock = false;
        }
        this.state.contentBlockIndex++;
        this.writer.writeWebSearchBlockStart(this.state.contentBlockIndex, toolUseId, results);
        this.writer.writeBlockStop(this.state.contentBlockIndex);
        this.state.currentBlockIndex = -1;
    }
    writeError(message) {
        this.writer.writeError(message);
    }
    // ============================================================================
    // Stop Reason Mapping
    // ============================================================================
    setStopReason(reason) {
        this.state.stopReason = reason;
    }
    // ============================================================================
    // SSE Parsing Utilities
    // ============================================================================
    /**
     * Parse SSE lines from buffer
     */
    parseSSELines(buffer) {
        const lines = buffer.split('\n');
        const remaining = lines.pop() || '';
        return { lines, remaining };
    }
    /**
     * Parse SSE data line
     */
    parseSSEData(line) {
        if (!line.startsWith('data:')) {
            return { data: null, isDone: false };
        }
        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') {
            return { data: null, isDone: true };
        }
        return { data: dataStr, isDone: false };
    }
    /**
     * Convert WebStream to Node Readable
     */
    streamToNodeReadable(stream) {
        return Readable.fromWeb(stream);
    }
}
// ============================================================================
// Stop Reason Mapping Tables
// ============================================================================
export const OPENAI_CHAT_STOP_REASON_MAP = {
    stop: 'end_turn',
    length: 'max_tokens',
    tool_calls: 'tool_use',
    content_filter: 'stop_sequence'
};
export const OPENAI_RESPONSES_STOP_REASON_MAP = {
    stop: 'end_turn',
    completed: 'end_turn',
    complete: 'end_turn',
    length: 'max_tokens',
    max_tokens: 'max_tokens',
    tool_calls: 'tool_use',
    tool_call: 'tool_use',
    tool_use: 'tool_use'
};
//# sourceMappingURL=base-stream-handler.js.map