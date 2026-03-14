/**
 * platform/event-bus -- FileWatcherSource
 *
 * Event source adapter that bridges the existing file-watcher worker
 * (managed by watcher-host.service.ts) into the unified event bus.
 *
 * Integration approach:
 * - Calls `addFsEventsHandler(callback)` on the watcher-host to receive
 *   ProcessedFsEvent batches from the child_process worker.
 * - Converts each ProcessedFsEvent into a HaloEvent with:
 *   - type: "file.changed" | "file.created" | "file.deleted"
 *   - source: "file-watcher"
 *   - payload: { spaceId, filePath, relativePath, changeType, extension, ... }
 * - Sets dedupKey to `"fw:{changeType}:{filePath}"` to prevent duplicate
 *   events within the TTL window (file-watcher already coalesces, but
 *   this adds a safety net for rapid re-triggers).
 *
 * Lifecycle:
 * - start(): registers the fs-events callback with watcher-host
 * - stop(): unregisters this specific callback via the returned unsubscribe fn
 */
import { extname } from 'path';
// ---------------------------------------------------------------------------
// Change type mapping
// ---------------------------------------------------------------------------
/**
 * Map ProcessedFsEvent.changeType to a HaloEvent type string.
 *
 * The file-watcher worker produces: 'add', 'addDir', 'change', 'unlink'
 * We normalize to: 'file.created', 'file.changed', 'file.deleted'
 */
function mapChangeType(changeType) {
    switch (changeType) {
        case 'add':
        case 'addDir':
            return 'file.created';
        case 'change':
            return 'file.changed';
        case 'unlink':
            return 'file.deleted';
        default:
            return 'file.changed';
    }
}
// ---------------------------------------------------------------------------
// Source Implementation
// ---------------------------------------------------------------------------
export class FileWatcherSource {
    id = 'file-watcher';
    type = 'file-watcher';
    emitFn = null;
    watcherHost;
    unsubscribe = null;
    constructor(watcherHost) {
        this.watcherHost = watcherHost;
    }
    start(emit) {
        this.emitFn = emit;
        this.unsubscribe = this.watcherHost.addFsEventsHandler((spaceId, events) => {
            if (!this.emitFn)
                return;
            for (const fsEvent of events) {
                const ext = fsEvent.relativePath
                    ? extname(fsEvent.relativePath).toLowerCase()
                    : '';
                this.emitFn({
                    type: mapChangeType(fsEvent.changeType),
                    source: this.id,
                    payload: {
                        spaceId,
                        filePath: fsEvent.filePath,
                        relativePath: fsEvent.relativePath,
                        changeType: fsEvent.changeType,
                        extension: ext,
                        parentDir: fsEvent.parentDir,
                        isDirectory: fsEvent.changeType === 'addDir',
                        // Include artifact data if available (for tree updates)
                        ...(fsEvent.artifact ? { artifact: fsEvent.artifact } : {}),
                        ...(fsEvent.treeNode ? { treeNode: fsEvent.treeNode } : {})
                    },
                    dedupKey: `fw:${fsEvent.changeType}:${fsEvent.filePath}`
                });
            }
        });
        console.log('[FileWatcherSource] Started -- listening to watcher-host events');
    }
    stop() {
        this.emitFn = null;
        // Deregister only this handler, leaving artifact-cache's handler intact
        if (this.unsubscribe) {
            try {
                this.unsubscribe();
            }
            catch {
                // Ignore -- watcher-host may already be shut down
            }
            this.unsubscribe = null;
        }
        console.log('[FileWatcherSource] Stopped');
    }
}
//# sourceMappingURL=file-watcher.source.js.map