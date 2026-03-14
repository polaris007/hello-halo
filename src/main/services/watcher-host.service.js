/**
 * Watcher Host Service -- manages the file-watcher utility process.
 *
 * Responsibilities:
 * - Fork and manage the utility process lifecycle
 * - Relay messages between main process and worker
 * - Handle crash recovery (auto-restart with pending space re-init)
 * - Provide async request/response API for scan operations
 */
import { fork } from 'child_process';
import { join } from 'path';
// --- Worker process management ---
let workerProcess = null;
let isShuttingDown = false;
// Track active spaces for crash recovery (re-init after restart)
const activeSpaces = new Map(); // spaceId -> rootPath
// Pending scan requests: requestId -> { resolve, reject, timer }
const pendingScans = new Map();
// Callbacks for events from worker
// fsEventsCallbacks supports multiple subscribers (artifact-cache + event-bus FileWatcherSource)
const onFsEventsCallbacks = new Set();
let onSpaceReadyCallback = null;
let onSpaceErrorCallback = null;
const SCAN_TIMEOUT_MS = 30000;
/**
 * Get worker entry file path.
 * Development: out/worker/file-watcher/index.mjs
 * Production: out/worker/file-watcher/index.mjs (inside app.asar)
 */
function getWorkerEntryPath() {
    // electron-vite puts worker output under out/main/worker/file-watcher/index.mjs
    // __dirname at runtime is out/main/, so the relative path is ./worker/...
    return join(__dirname, 'worker/file-watcher/index.mjs');
}
/**
 * Fork the file-watcher worker process using child_process.fork().
 */
function forkWorker() {
    const workerPath = getWorkerEntryPath();
    console.log(`[WatcherHost] Forking worker: ${workerPath}`);
    const child = fork(workerPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env },
    });
    // Handle messages from worker
    child.on('message', (msg) => {
        handleWorkerMessage(msg);
    });
    // Pipe worker stdout/stderr to main process log
    child.stdout?.on('data', (data) => {
        console.log(`[WatcherWorker] ${data.toString().trim()}`);
    });
    child.stderr?.on('data', (data) => {
        console.error(`[WatcherWorker] ${data.toString().trim()}`);
    });
    // Handle worker exit
    child.on('exit', (code, signal) => {
        console.warn(`[WatcherHost] Worker exited: code=${code}, signal=${signal}`);
        workerProcess = null;
        // Reject all pending scans
        for (const [requestId, pending] of Array.from(pendingScans.entries())) {
            clearTimeout(pending.timer);
            pending.reject(new Error(`Worker exited unexpectedly (code=${code})`));
            pendingScans.delete(requestId);
        }
        // Auto-restart unless shutting down
        if (!isShuttingDown && code !== 0) {
            console.log('[WatcherHost] Auto-restarting worker in 1s...');
            setTimeout(() => {
                if (!isShuttingDown) {
                    restartWithActiveSpaces();
                }
            }, 1000);
        }
    });
    child.on('error', (error) => {
        console.error('[WatcherHost] Worker error:', error);
    });
    return child;
}
/**
 * Restart worker and re-initialize all previously active spaces.
 */
function restartWithActiveSpaces() {
    const worker = ensureWorker();
    // Re-init all active spaces
    for (const [spaceId, rootPath] of Array.from(activeSpaces.entries())) {
        console.log(`[WatcherHost] Re-initializing space after restart: ${spaceId}`);
        worker.send({ type: 'init-space', spaceId, rootPath });
    }
}
function ensureWorker() {
    if (!workerProcess) {
        workerProcess = forkWorker();
    }
    return workerProcess;
}
function sendToWorker(msg) {
    const worker = ensureWorker();
    worker.send(msg);
}
// --- Worker message handler ---
function handleWorkerMessage(msg) {
    switch (msg.type) {
        case 'space-ready':
            console.log(`[WatcherHost] Space ready: ${msg.spaceId}`);
            onSpaceReadyCallback?.(msg.spaceId);
            break;
        case 'space-error':
            console.error(`[WatcherHost] Space error: ${msg.spaceId} - ${msg.error}`);
            onSpaceErrorCallback?.(msg.spaceId, msg.error);
            break;
        case 'scan-result': {
            const pending = pendingScans.get(msg.requestId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.resolve(msg);
                pendingScans.delete(msg.requestId);
            }
            break;
        }
        case 'scan-error': {
            const pending = pendingScans.get(msg.requestId);
            if (pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error(msg.error));
                pendingScans.delete(msg.requestId);
            }
            break;
        }
        case 'fs-events':
            for (const cb of Array.from(onFsEventsCallbacks)) {
                try {
                    cb(msg.spaceId, msg.events);
                }
                catch (err) {
                    console.error('[WatcherHost] fs-events callback error:', err);
                }
            }
            break;
        case 'log':
            if (msg.level === 'error') {
                console.error(`[WatcherWorker] ${msg.message}`);
            }
            else if (msg.level === 'warn') {
                console.warn(`[WatcherWorker] ${msg.message}`);
            }
            else {
                console.log(`[WatcherWorker] ${msg.message}`);
            }
            break;
    }
}
// --- Public API ---
let scanIdCounter = 0;
function nextScanId() {
    return `scan-${++scanIdCounter}-${Date.now()}`;
}
/**
 * Initialize watcher for a space (non-blocking, returns immediately)
 */
export function initSpaceWatcher(spaceId, rootPath) {
    activeSpaces.set(spaceId, rootPath);
    sendToWorker({ type: 'init-space', spaceId, rootPath });
}
/**
 * Destroy watcher for a space
 */
export function destroySpaceWatcher(spaceId) {
    activeSpaces.delete(spaceId);
    sendToWorker({ type: 'destroy-space', spaceId });
}
/**
 * Scan directory for tree nodes (async request/response via worker)
 */
export async function scanTreeViaWorker(spaceId, dirPath, rootPath, depth) {
    const requestId = nextScanId();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingScans.delete(requestId);
            reject(new Error(`Scan timeout: ${dirPath}`));
        }, SCAN_TIMEOUT_MS);
        pendingScans.set(requestId, {
            resolve: (msg) => {
                resolve(msg.nodes || []);
            },
            reject: (error) => {
                reject(error);
            },
            timer
        });
        sendToWorker({
            type: 'scan-dir',
            requestId,
            spaceId,
            dirPath,
            rootPath,
            depth,
            mode: 'tree'
        });
    });
}
/**
 * Scan directory for flat artifacts (async request/response via worker)
 */
export async function scanFlatViaWorker(spaceId, dirPath, rootPath, maxDepth) {
    const requestId = nextScanId();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pendingScans.delete(requestId);
            reject(new Error(`Scan timeout: ${dirPath}`));
        }, SCAN_TIMEOUT_MS);
        pendingScans.set(requestId, {
            resolve: (msg) => {
                resolve(msg.artifacts || []);
            },
            reject: (error) => {
                reject(error);
            },
            timer
        });
        sendToWorker({
            type: 'scan-dir',
            requestId,
            spaceId,
            dirPath,
            rootPath,
            depth: 0,
            mode: 'flat',
            maxDepth
        });
    });
}
/**
 * Reload .gitignore rules for a space
 */
export function refreshIgnoreRules(spaceId, rootPath) {
    sendToWorker({ type: 'refresh-ignore', spaceId, rootPath });
}
/**
 * Register a handler for file system events from worker.
 * Multiple handlers are supported simultaneously (artifact-cache + event-bus).
 * Returns an unsubscribe function that removes this specific handler.
 */
export function addFsEventsHandler(cb) {
    onFsEventsCallbacks.add(cb);
    return () => { onFsEventsCallbacks.delete(cb); };
}
/**
 * @deprecated Use addFsEventsHandler() for multi-subscriber support.
 * Kept for backward compatibility; adds to the handler set (does not replace).
 */
export function setFsEventsHandler(cb) {
    onFsEventsCallbacks.add(cb);
}
/**
 * Set the handler for space ready events.
 * Only one handler is supported; calling again overwrites the previous one.
 */
export function setSpaceReadyHandler(cb) {
    if (onSpaceReadyCallback) {
        console.warn('[WatcherHost] Overwriting existing SpaceReady handler');
    }
    onSpaceReadyCallback = cb;
}
/**
 * Set the handler for space error events.
 * Only one handler is supported; calling again overwrites the previous one.
 */
export function setSpaceErrorHandler(cb) {
    if (onSpaceErrorCallback) {
        console.warn('[WatcherHost] Overwriting existing SpaceError handler');
    }
    onSpaceErrorCallback = cb;
}
/**
 * Shutdown the worker process gracefully
 */
export async function shutdown() {
    isShuttingDown = true;
    activeSpaces.clear();
    // Reject all pending scans
    for (const [requestId, pending] of Array.from(pendingScans.entries())) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Worker shutting down'));
        pendingScans.delete(requestId);
    }
    if (workerProcess) {
        console.log('[WatcherHost] Shutting down worker...');
        workerProcess.kill('SIGTERM');
        await new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (workerProcess) {
                    console.warn('[WatcherHost] Force killing worker after timeout');
                    workerProcess.kill('SIGKILL');
                }
                resolve();
            }, 3000);
            workerProcess.on('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
        workerProcess = null;
    }
}
//# sourceMappingURL=watcher-host.service.js.map