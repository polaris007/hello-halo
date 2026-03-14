/**
 * Store IPC Handlers
 *
 * Exposes the Store (App Registry) operations to the renderer process.
 *
 * Channels:
 *   store:list-apps       List apps from the store with optional filtering
 *   store:get-app-detail  Get detailed info about a store app by slug
 *   store:install         Install an app from the store into a space
 *   store:refresh         Refresh the registry index from remote sources
 *   store:check-updates   Check for available updates for installed apps
 *   store:get-registries  Get the list of configured registry sources
 *   store:add-registry    Add a new registry source
 *   store:remove-registry Remove a registry source
 *   store:toggle-registry Enable or disable a registry source
 */
import { ipcMain } from 'electron';
import * as storeController from '../controllers/store.controller';
export function registerStoreHandlers() {
    // ── store:list-apps ────────────────────────────────────────────────────
    ipcMain.handle('store:list-apps', async (_event, query) => {
        return storeController.listStoreApps(query);
    });
    // ── store:get-app-detail ───────────────────────────────────────────────
    ipcMain.handle('store:get-app-detail', async (_event, slug) => {
        return storeController.getStoreAppDetail(slug);
    });
    // ── store:install ──────────────────────────────────────────────────────
    ipcMain.handle('store:install', async (_event, input) => {
        return storeController.installStoreApp(input.slug, input.spaceId, input.userConfig);
    });
    // ── store:refresh ──────────────────────────────────────────────────────
    ipcMain.handle('store:refresh', async () => {
        return storeController.refreshStoreIndex();
    });
    // ── store:check-updates ────────────────────────────────────────────────
    ipcMain.handle('store:check-updates', async () => {
        return storeController.checkStoreUpdates();
    });
    // ── store:get-registries ───────────────────────────────────────────────
    ipcMain.handle('store:get-registries', async () => {
        return storeController.getStoreRegistries();
    });
    // ── store:add-registry ─────────────────────────────────────────────────
    ipcMain.handle('store:add-registry', async (_event, input) => {
        return storeController.addStoreRegistry(input);
    });
    // ── store:remove-registry ──────────────────────────────────────────────
    ipcMain.handle('store:remove-registry', async (_event, registryId) => {
        return storeController.removeStoreRegistry(registryId);
    });
    // ── store:toggle-registry ──────────────────────────────────────────────
    ipcMain.handle('store:toggle-registry', async (_event, input) => {
        return storeController.toggleStoreRegistry(input.registryId, input.enabled);
    });
    console.log('[StoreIPC] Store handlers registered (9 channels)');
}
//# sourceMappingURL=store.js.map