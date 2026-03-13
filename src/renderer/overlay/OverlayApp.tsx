/**
 * Overlay App - Root component for the overlay SPA
 *
 * This app manages all floating UI elements that need to render
 * above BrowserViews. It listens for IPC messages to show/hide
 * different overlay components.
 *
 * Supported overlays:
 * - ChatCapsule: Floating button to return to chat when canvas is maximized
 * - (Future) Dialogs, menus, tooltips, etc.
 */

import { useEffect, useState } from 'react'
import { ChatCapsuleOverlay } from './ChatCapsuleOverlay'

// Overlay state received from main process
interface OverlayState {
  showChatCapsule: boolean
  // Future overlay states
  // showDialog: boolean
  // dialogProps: DialogProps | null
}

const initialState: OverlayState = {
  showChatCapsule: false,
}

export function OverlayApp() {
  const [state, setState] = useState<OverlayState>(initialState)

  useEffect(() => {
    // Listen for overlay state changes from main process
    // Note: preload strips the event, so we receive newState directly as first argument
    const handleOverlayState = (newState: Partial<OverlayState>) => {
      setState(prev => ({ ...prev, ...newState }))
    }

    // Subscribe to IPC events (only available in Electron environment)
    const electronApi = (window as any).electron?.ipcRenderer
    if (electronApi) {
      electronApi.on('overlay:state-change', handleOverlayState)
      electronApi.send('overlay:ready')
    }

    return () => {
      if (electronApi) {
        electronApi.removeListener('overlay:state-change', handleOverlayState)
      }
    }
  }, [])

  // Handle capsule click - notify main process
  const handleCapsuleClick = () => {
    const electronApi = (window as any).electron?.ipcRenderer
    if (electronApi) {
      electronApi.send('overlay:exit-maximized')
    }
  }

  return (
    <div className="fixed inset-0 pointer-events-none">
      {/* ChatCapsule - shown when canvas is maximized */}
      {state.showChatCapsule && (
        <ChatCapsuleOverlay onClick={handleCapsuleClick} />
      )}

      {/*
        Future overlays can be added here:
        {state.showDialog && <DialogOverlay {...state.dialogProps} />}
        {state.showMenu && <MenuOverlay {...state.menuProps} />}
      */}
    </div>
  )
}
