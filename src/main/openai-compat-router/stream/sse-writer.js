/**
 * SSE (Server-Sent Events) Writer
 *
 * Provides a type-safe abstraction for writing Anthropic SSE events
 */
/**
 * Type-safe SSE writer for Anthropic streaming format
 */
export class SSEWriter {
    res;
    debug;
    closed = false;
    constructor(res, options = {}) {
        this.res = res;
        this.debug = options.debug ?? false;
    }
    /**
     * Check if the writer is closed
     */
    get isClosed() {
        return this.closed;
    }
    /**
     * Write a raw SSE event
     */
    writeEvent(event, data) {
        if (this.closed)
            return false;
        try {
            const jsonData = JSON.stringify(data);
            this.res.write(`event: ${event}\ndata: ${jsonData}\n\n`);
            if (this.debug) {
                console.log(`[SSEWriter] Send: ${event}`, jsonData.slice(0, 200));
            }
            return true;
        }
        catch (e) {
            if (e instanceof TypeError && String(e.message).includes('Controller is already closed')) {
                this.closed = true;
            }
            else if (this.debug) {
                console.error('[SSEWriter] Error writing event:', e);
            }
            return false;
        }
    }
    /**
     * Write message_start event
     */
    writeMessageStart(messageId, model) {
        const event = {
            type: 'message_start',
            message: {
                id: messageId,
                type: 'message',
                role: 'assistant',
                content: [],
                model,
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 }
            }
        };
        return this.writeEvent('message_start', event);
    }
    /**
     * Write content_block_start event for text block
     */
    writeTextBlockStart(index) {
        const event = {
            type: 'content_block_start',
            index,
            content_block: { type: 'text', text: '' }
        };
        return this.writeEvent('content_block_start', event);
    }
    /**
     * Write content_block_start event for tool_use block
     */
    writeToolUseBlockStart(index, id, name) {
        const event = {
            type: 'content_block_start',
            index,
            content_block: { type: 'tool_use', id, name, input: {} }
        };
        return this.writeEvent('content_block_start', event);
    }
    /**
     * Write content_block_start event for thinking block
     */
    writeThinkingBlockStart(index) {
        const event = {
            type: 'content_block_start',
            index,
            content_block: { type: 'thinking', thinking: '' }
        };
        return this.writeEvent('content_block_start', event);
    }
    /**
     * Write content_block_start event for web_search_tool_result
     */
    writeWebSearchBlockStart(index, toolUseId, results) {
        const event = {
            type: 'content_block_start',
            index,
            content_block: {
                type: 'web_search_tool_result',
                tool_use_id: toolUseId,
                content: results
            }
        };
        return this.writeEvent('content_block_start', event);
    }
    /**
     * Write content_block_delta event for text
     */
    writeTextDelta(index, text) {
        const event = {
            type: 'content_block_delta',
            index,
            delta: { type: 'text_delta', text }
        };
        return this.writeEvent('content_block_delta', event);
    }
    /**
     * Write content_block_delta event for tool input JSON
     */
    writeInputJsonDelta(index, partialJson) {
        const event = {
            type: 'content_block_delta',
            index,
            delta: { type: 'input_json_delta', partial_json: partialJson }
        };
        return this.writeEvent('content_block_delta', event);
    }
    /**
     * Write content_block_delta event for thinking
     */
    writeThinkingDelta(index, thinking) {
        const event = {
            type: 'content_block_delta',
            index,
            delta: { type: 'thinking_delta', thinking }
        };
        return this.writeEvent('content_block_delta', event);
    }
    /**
     * Write content_block_delta event for signature
     */
    writeSignatureDelta(index, signature) {
        const event = {
            type: 'content_block_delta',
            index,
            delta: { type: 'signature_delta', signature }
        };
        return this.writeEvent('content_block_delta', event);
    }
    /**
     * Write content_block_stop event
     */
    writeBlockStop(index) {
        const event = {
            type: 'content_block_stop',
            index
        };
        return this.writeEvent('content_block_stop', event);
    }
    /**
     * Write message_delta event
     */
    writeMessageDelta(stopReason, usage) {
        const event = {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: {
                output_tokens: usage.outputTokens ?? 0
            }
        };
        // Add additional usage fields if present
        const eventData = event;
        if (usage.inputTokens !== undefined) {
            eventData.usage.input_tokens = usage.inputTokens;
        }
        if (usage.cacheReadTokens !== undefined) {
            eventData.usage.cache_read_input_tokens = usage.cacheReadTokens;
        }
        return this.writeEvent('message_delta', event);
    }
    /**
     * Write message_stop event
     */
    writeMessageStop() {
        const event = {
            type: 'message_stop'
        };
        return this.writeEvent('message_stop', event);
    }
    /**
     * Write error event
     */
    writeError(message) {
        return this.writeEvent('error', {
            type: 'error',
            message: { type: 'api_error', message }
        });
    }
    /**
     * End the response
     */
    end() {
        if (!this.closed) {
            this.res.end();
            this.closed = true;
        }
    }
    /**
     * Write error response and end
     */
    sendError(statusCode, errorType, message) {
        if (!this.closed) {
            this.res.status(statusCode).json({
                type: 'error',
                error: { type: errorType, message }
            });
            this.closed = true;
        }
    }
}
//# sourceMappingURL=sse-writer.js.map