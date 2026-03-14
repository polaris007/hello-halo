/**
 * Session Detail Storage
 *
 * Persists App run execution messages as JSONL for the "View process" drill-down.
 * Files are stored at: {spacePath}/.halo/apps/{appId}/runs/{runId}.jsonl
 *
 * Completely separate from the conversation storage system — no pollution
 * of the user's conversation list.
 *
 * Format: one JSON object per line (JSONL), each representing a SDK stream event.
 * On read, events are converted to the renderer's Message format — including
 * the `thoughts[]` array (thinking, tool_use, tool_result) — so that the
 * existing MessageItem component renders them identically to main-chat messages.
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync } from 'fs';
import { join } from 'path';
/** Get the directory for run session files */
function getRunsDir(spacePath, appId) {
    return join(spacePath, '.halo', 'apps', appId, 'runs');
}
/** Get the JSONL file path for a specific run */
function getSessionFilePath(spacePath, appId, runId) {
    return join(getRunsDir(spacePath, appId), `${runId}.jsonl`);
}
/**
 * Create a session writer that appends events to a JSONL file.
 * Automatically creates the runs directory if missing.
 */
export function openSessionWriter(spacePath, appId, runId) {
    const dir = getRunsDir(spacePath, appId);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    const filePath = getSessionFilePath(spacePath, appId, runId);
    function appendLine(event) {
        try {
            appendFileSync(filePath, JSON.stringify(event) + '\n', 'utf8');
        }
        catch (err) {
            console.error(`[SessionStore] Failed to write event to ${filePath}:`, err);
        }
    }
    return {
        writeEvent(event) {
            appendLine({ _ts: new Date().toISOString(), ...event });
        },
        writeTrigger(content) {
            appendLine({
                _ts: new Date().toISOString(),
                type: 'user',
                _isTrigger: true,
                message: { role: 'user', content: [{ type: 'text', text: content }] },
            });
        },
    };
}
// ============================================
// Reader
// ============================================
/**
 * Read a run's session JSONL and convert to renderer-compatible Message[].
 *
 * Returns an empty array if the file doesn't exist or is unreadable.
 */
export function readSessionMessages(spacePath, appId, runId) {
    const filePath = getSessionFilePath(spacePath, appId, runId);
    if (!existsSync(filePath))
        return [];
    let raw;
    try {
        raw = readFileSync(filePath, 'utf8');
    }
    catch {
        return [];
    }
    const lines = raw.split('\n').filter(l => l.trim());
    const events = [];
    for (const line of lines) {
        try {
            events.push(JSON.parse(line));
        }
        catch {
            // Skip malformed lines
        }
    }
    return convertEventsToMessages(events);
}
/**
 * Check if a session file exists for a given run.
 */
export function sessionExists(spacePath, appId, runId) {
    return existsSync(getSessionFilePath(spacePath, appId, runId));
}
// ============================================
// Event → Message Conversion
// ============================================
/** Incrementing counter for generating unique IDs within a session read */
let _thoughtIdx = 0;
function generateThoughtId() {
    return `session-thought-${++_thoughtIdx}`;
}
/**
 * Convert stored SDK events into renderer-compatible Message[] with full thoughts.
 *
 * Strategy — accumulate-and-flush (optimized for automation runs):
 *
 * An automation run's agent loop produces many rounds of:
 *   assistant (thinking + tool_use) → user (tool_result) → assistant (thinking + tool_use) → ...
 *
 * Unlike the main chat where each round is a visible message exchange, automation runs
 * are a single task execution. Showing each round as a separate "thought process" block
 * creates visual clutter (many collapsed "思考过程 0.0s" blocks).
 *
 * Instead, we:
 * 1. Accumulate all thinking/tool_use blocks across consecutive assistant events
 *    into one shared thoughts[] array.
 * 2. Tool-result user events merge into the corresponding tool_use thought (no visible message).
 * 3. Only when an assistant event contains actual text output do we "flush" — creating
 *    a single Message with all accumulated thoughts + the text content.
 * 4. Non-tool user events (trigger messages) are always shown as separate messages
 *    and cause a flush of any pending thoughts.
 *
 * Result: one large collapsed thought block with the full execution trace,
 * and text outputs displayed as clean message bubbles below.
 */
function convertEventsToMessages(events) {
    _thoughtIdx = 0; // Reset per read
    const messages = [];
    let msgIdx = 0;
    // Map from SDK tool_use block id → ThoughtRecord reference (for result merging)
    const toolUseMap = new Map();
    // ── Accumulator: collects thoughts across multiple assistant events ──
    let pendingThoughts = [];
    let lastThoughtTs = '';
    /** Flush accumulated thoughts + text into one Message */
    function flush(textContent, textTs) {
        if (pendingThoughts.length === 0 && !textContent)
            return;
        const record = {
            id: `session-msg-${++msgIdx}`,
            role: 'assistant',
            content: textContent,
            timestamp: textTs || lastThoughtTs || new Date().toISOString(),
        };
        if (pendingThoughts.length > 0) {
            record.thoughts = pendingThoughts;
            record.thoughtsSummary = buildThoughtsSummary(pendingThoughts);
        }
        messages.push(record);
        pendingThoughts = [];
        lastThoughtTs = '';
    }
    for (const event of events) {
        const ts = event._ts || new Date().toISOString();
        // ── User events ──
        if (event.type === 'user') {
            const content = event.message?.content;
            const toolResults = extractToolResults(content);
            if (toolResults.length > 0) {
                // Tool-result user message: merge results into corresponding tool_use thoughts.
                // These are internal round-trip messages, not visible to the user.
                for (const tr of toolResults) {
                    const toolThought = toolUseMap.get(tr.toolUseId);
                    if (toolThought) {
                        toolThought.toolResult = {
                            output: tr.output,
                            isError: tr.isError,
                            timestamp: ts,
                        };
                    }
                }
            }
            else {
                // Normal user message (trigger or escalation response).
                // Flush any pending thoughts before showing the user message.
                flush('', ts);
                const textContent = extractTextContent(content);
                if (textContent) {
                    messages.push({
                        id: `session-msg-${++msgIdx}`,
                        role: 'user',
                        content: textContent,
                        timestamp: ts,
                    });
                }
            }
            continue;
        }
        // ── Assistant events ──
        if (event.type === 'assistant') {
            const content = event.message?.content;
            if (!Array.isArray(content))
                continue;
            const textContent = extractTextContent(content);
            // Extract thinking and tool_use blocks into the accumulator
            for (const block of content) {
                if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim()) {
                    pendingThoughts.push({
                        id: generateThoughtId(),
                        type: 'thinking',
                        content: block.thinking,
                        timestamp: ts,
                    });
                    lastThoughtTs = ts;
                }
                if (block.type === 'tool_use') {
                    const thought = {
                        id: generateThoughtId(),
                        type: 'tool_use',
                        content: '',
                        timestamp: ts,
                        toolName: block.name || '',
                        toolInput: block.input || {},
                    };
                    pendingThoughts.push(thought);
                    lastThoughtTs = ts;
                    if (block.id) {
                        toolUseMap.set(block.id, thought);
                    }
                }
            }
            // If this assistant event has text output, flush everything:
            // all accumulated thoughts become the collapsed block above the text bubble.
            if (textContent) {
                flush(textContent, ts);
            }
            continue;
        }
        // Skip 'result', 'system' events — they are metadata, not displayable messages
    }
    // Flush any trailing thoughts that weren't followed by text output.
    // This happens when the AI only did thinking/tool calls without producing text
    // (common for runs where all output goes through report_to_user).
    flush('', lastThoughtTs);
    return messages;
}
/**
 * Build a lightweight ThoughtsSummary from an array of thoughts.
 * Used by CollapsedThoughtProcess to display the collapsed header
 * without iterating the full thoughts array in the renderer.
 */
function buildThoughtsSummary(thoughts) {
    const types = {};
    for (const t of thoughts) {
        types[t.type] = (types[t.type] || 0) + 1;
    }
    return {
        count: thoughts.length,
        types,
    };
}
// ============================================
// Content Block Extractors
// ============================================
function extractTextContent(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content
        .filter((b) => b.type === 'text')
        .map((b) => b.text || '')
        .join('');
}
function extractToolResults(content) {
    if (!Array.isArray(content))
        return [];
    return content
        .filter((b) => b.type === 'tool_result')
        .map((b) => ({
        toolUseId: b.tool_use_id || '',
        output: typeof b.content === 'string'
            ? b.content
            : Array.isArray(b.content)
                ? b.content.filter((c) => c.type === 'text').map((c) => c.text).join('')
                : JSON.stringify(b.content ?? ''),
        isError: !!b.is_error,
    }));
}
//# sourceMappingURL=session-store.js.map