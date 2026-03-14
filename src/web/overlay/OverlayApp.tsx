/**
 * Overlay App - Root component for the overlay SPA
 *
 * This app manages all floating UI elements.
 * In the web version, overlay state is managed via postMessage from the main window.
 */

import { useEffect, useState } from 'react'
import { ChatCapsuleOverlay } from './ChatCapsuleOverlay'

// Overlay state received from parent window
interface OverlayState {
  showChatCapsule: boolean
}

const initialState: OverlayState = {
  showChatCapsule: false,
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>(initialState)

  useEffect(() => {
    // Listen for overlay state changes from parent window via postMessage
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'overlay:state-change') {
        setState(prev => ({ ...prev, ...event.data.state }))
      }
    }

    window.addEventListener('message', handleMessage)

    // Notify parent window that overlay is ready
    window.parent?.postMessage({ type: 'overlay:ready' }, '*')

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // Handle capsule click - notify parent window
  const handleCapsuleClick = () => {
    window.parent?.postMessage({ type: 'overlay:exit-maximized' }, '*')
  }

  return (
    <div className="fixed inset-0 pointer-events-none">
      {state.showChatCapsule && (
        <ChatCapsuleOverlay onClick={handleCapsuleClick} />
      )}
    </div>
  )
}
