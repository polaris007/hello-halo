/**
 * Onboarding IPC Handlers
 */
import { ipcMain } from 'electron';
import { writeOnboardingArtifact, saveOnboardingConversation } from '../services/onboarding.service';
export function registerOnboardingHandlers() {
    // Write onboarding artifact (HTML file)
    ipcMain.handle('onboarding:write-artifact', async (_event, spaceId, filename, content) => {
        console.log('[Settings] onboarding:write-artifact - Writing:', filename, 'to space:', spaceId);
        try {
            const result = writeOnboardingArtifact(spaceId, filename, content);
            console.log('[Settings] onboarding:write-artifact - Written successfully');
            return result;
        }
        catch (error) {
            const err = error;
            console.error('[Settings] onboarding:write-artifact - Failed:', err.message);
            return { success: false, error: err.message };
        }
    });
    // Save onboarding conversation
    ipcMain.handle('onboarding:save-conversation', async (_event, spaceId, userPrompt, aiResponse) => {
        console.log('[Settings] onboarding:save-conversation - Saving to space:', spaceId);
        try {
            const result = saveOnboardingConversation(spaceId, userPrompt, aiResponse);
            console.log('[Settings] onboarding:save-conversation - Saved successfully');
            return result;
        }
        catch (error) {
            const err = error;
            console.error('[Settings] onboarding:save-conversation - Failed:', err.message);
            return { success: false, error: err.message };
        }
    });
    console.log('[Settings] Onboarding handlers registered');
}
//# sourceMappingURL=onboarding.js.map