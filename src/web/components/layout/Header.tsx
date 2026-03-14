/**
 * Header Component - Cross-platform title bar
 *
 * Handles platform-specific padding for window controls:
 * - macOS Electron: traffic lights on the left (pl-20)
 * - Windows/Linux Electron: titleBarOverlay buttons on the right (pr-36)
 * - Browser/Mobile: no extra padding needed (pl-4)
 *
 * Height: 40px (compact, modern style)
 * Traffic light vertical center formula: y = height/2 - 7 = 13
 */

import { ReactNode } from 'react'

interface HeaderProps {
  /** Left side content (after platform padding) */
  left?: ReactNode
  /** Right side content (before platform padding) */
  right?: ReactNode
  /** Additional className for header */
  className?: string
}

// Get platform info with fallback for browser
const getPlatform = () => {
  // In B/S architecture, detect from user agent
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isMac = /Mac|iPod|iPhone|iPad/.test(userAgent)
  const isWindows = /Windows/.test(userAgent)
  const isLinux = /Linux/.test(userAgent) && !/Android/.test(userAgent)

  return {
    platform: isMac ? 'darwin' : isWindows ? 'win32' : isLinux ? 'linux' : 'darwin',
    isMac,
    isWindows,
    isLinux
  }
}

export function Header({ left, right, className = '' }: HeaderProps) {
  // In B/S architecture, use normal padding (no traffic lights or titleBarOverlay)
  const platformPadding = 'pl-4 pr-4'

  return (
    <header
      className={`
        flex items-center justify-between h-10
        border-b border-border drag-region
        ${platformPadding}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {/* Left side: Interactive elements need no-drag to allow clicks */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="no-drag flex items-center gap-2 sm:gap-3">
          {left}
        </div>
      </div>

      {/* Center: Draggable area - grows to fill space */}
      <div className="flex-1 min-w-[100px]" />

      {/* Right side: Interactive elements need no-drag to allow clicks */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <div className="no-drag flex items-center gap-1 sm:gap-2">
          {right}
        </div>
      </div>
    </header>
  )
}

// Export platform detection hook for use in other components
export function usePlatform() {
  return getPlatform()
}
