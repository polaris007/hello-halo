/**
 * Agent Module - Control Functions
 *
 * Functions for controlling agent execution:
 * - Stop generation
 * - Tool approval/rejection
 * - Question answering
 */

import { activeSessions, getSSEStream, cancelPendingInput } from './session-manager.js'

/**
 * Stop generation for a conversation
 */
export async function stopGeneration(conversationId: string): Promise<void> {
  console.log(`[Agent] Stopping generation for ${conversationId}`)

  // 1. 从 activeSSEStreams 获取并中断 SSE 流
  const sseStream = getSSEStream(conversationId)
  if (sseStream) {
    console.log(`[Agent][${conversationId}] Found SSE stream, aborting...`)
    sseStream.controller.abort()
    // 注意：不在这里调用 unregisterSSEStream，让 finally 块处理
  }

  // 2. 取消该对话的等待状态
  cancelPendingInput(conversationId)

  // 3. 中断 active session
  const session = activeSessions.get(conversationId)
  if (session) {
    session.abortController.abort()
  } else {
    console.log(`[Agent] No active session to stop for ${conversationId}`)
  }
}
