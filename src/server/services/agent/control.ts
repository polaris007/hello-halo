/**
 * Agent Module - Control Functions
 *
 * Functions for controlling agent execution:
 * - Stop generation
 * - Tool approval/rejection
 * - Question answering
 */

import { activeSessions } from './session-manager'

/**
 * Stop generation for a conversation
 */
export async function stopGeneration(conversationId: string): Promise<void> {
  const session = activeSessions.get(conversationId)
  if (session) {
    console.log(`[Agent] Stopping generation for ${conversationId}`)
    session.abortController.abort()
  } else {
    console.log(`[Agent] No active session to stop for ${conversationId}`)
  }
}
