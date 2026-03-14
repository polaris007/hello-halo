/**
 * Recovery UI - Native dialog-based recovery prompts
 *
 * Provides user-facing dialogs for recovery actions that require consent.
 * Uses Electron's native dialog API for consistent platform experience.
 *
 * Design reference: health-system-design.md section 7.3
 */
import { dialog } from 'electron';
import { getStrategy } from './strategies';
// ============================================
// State
// ============================================
/** Track if user has chosen to suppress dialogs for this session */
let suppressDialogs = false;
/** Track recent dialog displays to prevent spam */
let lastDialogTime = 0;
const DIALOG_COOLDOWN_MS = 10_000; // 10 seconds between dialogs
// ============================================
// Dialog Display
// ============================================
/**
 * Show recovery dialog to user
 *
 * Returns the user's chosen action. If dialogs are suppressed or
 * on cooldown, returns 'ignore' without showing a dialog.
 */
export async function showRecoveryDialog(options) {
    const { consecutiveFailures, errorMessage, suggestedStrategy, parentWindow } = options;
    // Check if dialogs are suppressed
    if (suppressDialogs) {
        console.log('[Health][UI] Dialogs suppressed for this session');
        return { action: 'ignore', suppressFuture: true };
    }
    // Check cooldown
    const now = Date.now();
    if (now - lastDialogTime < DIALOG_COOLDOWN_MS) {
        console.log('[Health][UI] Dialog on cooldown');
        return { action: 'ignore', suppressFuture: false };
    }
    lastDialogTime = now;
    const strategy = getStrategy(suggestedStrategy);
    // Build dialog message
    const title = 'Halo is having trouble';
    const message = buildDialogMessage(consecutiveFailures, errorMessage, strategy);
    // Build buttons based on strategy
    const buttons = buildDialogButtons(suggestedStrategy);
    try {
        const result = await dialog.showMessageBox(parentWindow || undefined, {
            type: 'warning',
            title,
            message: title,
            detail: message,
            buttons: buttons.labels,
            defaultId: 0,
            cancelId: buttons.labels.length - 1,
            checkboxLabel: "Don't show again this session",
            checkboxChecked: false
        });
        // Handle checkbox
        if (result.checkboxChecked) {
            suppressDialogs = true;
        }
        // Map button index to action
        const action = buttons.actions[result.response] || 'ignore';
        console.log(`[Health][UI] User selected: ${action}, suppress: ${result.checkboxChecked}`);
        return {
            action: action,
            suppressFuture: result.checkboxChecked
        };
    }
    catch (error) {
        console.error('[Health][UI] Dialog error:', error);
        return { action: 'ignore', suppressFuture: false };
    }
}
/**
 * Show simple notification dialog (no choices)
 * Internal use only - not exported from module
 */
async function showNotificationDialog(title, message, type = 'info', parentWindow) {
    try {
        await dialog.showMessageBox(parentWindow || undefined, {
            type,
            title,
            message: title,
            detail: message,
            buttons: ['OK']
        });
    }
    catch (error) {
        console.error('[Health][UI] Notification dialog error:', error);
    }
}
/**
 * Show confirmation dialog for destructive actions
 * Internal use only - not exported from module
 */
async function showConfirmationDialog(title, message, confirmLabel = 'Confirm', parentWindow) {
    try {
        const result = await dialog.showMessageBox(parentWindow || undefined, {
            type: 'warning',
            title,
            message: title,
            detail: message,
            buttons: [confirmLabel, 'Cancel'],
            defaultId: 1, // Default to Cancel
            cancelId: 1
        });
        return result.response === 0;
    }
    catch (error) {
        console.error('[Health][UI] Confirmation dialog error:', error);
        return false;
    }
}
// ============================================
// Dialog Content Builders
// ============================================
function buildDialogMessage(failures, errorMessage, strategy) {
    const lines = [];
    // Primary message
    if (errorMessage) {
        lines.push(errorMessage);
    }
    else {
        lines.push('AI services failed to respond multiple times.');
    }
    lines.push(''); // Empty line
    // Failure count
    lines.push(`Consecutive failures: ${failures}`);
    lines.push(''); // Empty line
    // Strategy description
    lines.push(`Recommended action: ${strategy.name}`);
    lines.push(strategy.description);
    return lines.join('\n');
}
function buildDialogButtons(strategyId) {
    switch (strategyId) {
        case 'S2':
            // Reset Agent Engine - auto recovery, no consent needed
            // But if shown, offer manual options
            return {
                labels: ['Try to Fix', 'Ignore'],
                actions: ['tryFix', 'ignore']
            };
        case 'S3':
            // Restart App - requires consent
            return {
                labels: ['Restart App', 'Try to Fix', 'Ignore'],
                actions: ['restart', 'tryFix', 'ignore']
            };
        case 'S4':
            // Factory Reset - requires consent
            return {
                labels: ['Factory Reset', 'Restart App', 'Ignore'],
                actions: ['factoryReset', 'restart', 'ignore']
            };
        default:
            return {
                labels: ['Try to Fix', 'Ignore'],
                actions: ['tryFix', 'ignore']
            };
    }
}
// ============================================
// State Management
// ============================================
/**
 * Reset dialog suppression (e.g., on new session)
 */
export function resetDialogSuppression() {
    suppressDialogs = false;
    console.log('[Health][UI] Dialog suppression reset');
}
/**
 * Check if dialogs are currently suppressed
 */
export function isDialogSuppressed() {
    return suppressDialogs;
}
/**
 * Manually suppress dialogs
 */
export function suppressAllDialogs() {
    suppressDialogs = true;
}
// ============================================
// Specific Recovery Dialogs
// ============================================
/**
 * Show dialog for S3 (Restart App) recovery
 */
export async function showRestartAppDialog(failures, parentWindow) {
    const result = await showRecoveryDialog({
        consecutiveFailures: failures,
        suggestedStrategy: 'S3',
        parentWindow
    });
    return result.action === 'restart';
}
/**
 * Show dialog for S4 (Factory Reset) recovery
 */
export async function showFactoryResetDialog(parentWindow) {
    // Factory reset is destructive, always show confirmation
    return showConfirmationDialog('Factory Reset', 'This will clear all cached data and reset configuration to defaults.\n\n' +
        'Your conversation data will be preserved, but you will need to reconfigure your API settings.\n\n' +
        'Are you sure you want to continue?', 'Reset & Restart', parentWindow);
}
/**
 * Show dialog when recovery succeeded
 */
export async function showRecoverySuccessDialog(strategyName, parentWindow) {
    await showNotificationDialog('Recovery Successful', `${strategyName} completed successfully.\n\nHalo should be working normally now.`, 'info', parentWindow);
}
/**
 * Show dialog when recovery failed
 */
export async function showRecoveryFailedDialog(strategyName, errorMessage, parentWindow) {
    await showNotificationDialog('Recovery Failed', `${strategyName} could not be completed.\n\nError: ${errorMessage}\n\n` +
        'You may need to restart Halo manually or contact support.', 'error', parentWindow);
}
//# sourceMappingURL=ui.js.map