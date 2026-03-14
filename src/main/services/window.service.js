/**
 * Window Service - Centralized main window management
 *
 * Uses publish-subscribe pattern (consistent with artifact-cache.service.ts)
 * to notify modules when the main window changes.
 *
 * Benefits:
 * - Single source of truth for mainWindow reference
 * - Modules subscribe once, automatically get updates on window recreation
 * - Eliminates scattered setXxxMainWindow() calls in index.ts
 * - Supports renderer recovery (window recreation) seamlessly
 */
// Listener registry (same pattern as artifact-cache.service.ts)
const windowChangeListeners = [];
// Current main window reference
let mainWindow = null;
/**
 * Get the current main window
 * Returns null if window is destroyed or not created yet
 */
export function getMainWindow() {
    if (mainWindow && mainWindow.isDestroyed()) {
        mainWindow = null;
    }
    return mainWindow;
}
/**
 * Set the main window reference
 * Notifies all registered listeners of the change
 *
 * Called by:
 * - createWindow() when window is created
 * - window 'closed' event to clear reference
 * - recoverRenderer() when recreating window
 */
export function setMainWindow(window) {
    const previousWindow = mainWindow;
    mainWindow = window;
    // Only notify if window actually changed
    if (previousWindow !== window) {
        console.log(`[WindowService] Main window ${window ? 'set' : 'cleared'}`);
        // Notify all listeners
        for (const listener of windowChangeListeners) {
            try {
                listener(window);
            }
            catch (error) {
                console.error('[WindowService] Listener error:', error);
            }
        }
    }
}
/**
 * Subscribe to window changes
 * Listener is called immediately if window already exists
 *
 * @param callback - Function to call when window changes
 * @returns Unsubscribe function
 *
 * Usage:
 * ```typescript
 * // In module initialization
 * onMainWindowChange((window) => {
 *   mainWindowRef = window
 * })
 * ```
 */
export function onMainWindowChange(callback) {
    windowChangeListeners.push(callback);
    // Immediately call with current window (if exists)
    // This ensures modules get the reference even if they subscribe after window creation
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            callback(mainWindow);
        }
        catch (error) {
            console.error('[WindowService] Initial callback error:', error);
        }
    }
    // Return unsubscribe function
    return () => {
        const index = windowChangeListeners.indexOf(callback);
        if (index > -1) {
            windowChangeListeners.splice(index, 1);
        }
    };
}
/**
 * Send message to renderer via main window
 * Safely handles null/destroyed window
 *
 * @param channel - IPC channel name
 * @param args - Arguments to send
 * @returns true if message was sent, false otherwise
 */
export function sendToRenderer(channel, ...args) {
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
        try {
            window.webContents.send(channel, ...args);
            return true;
        }
        catch (error) {
            console.error(`[WindowService] Failed to send '${channel}':`, error);
        }
    }
    return false;
}
//# sourceMappingURL=window.service.js.map