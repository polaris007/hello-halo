/**
 * apps/runtime -- Concurrency Control
 *
 * Counting semaphore for limiting concurrent App runs.
 * Queued callers wait in FIFO order until a slot is released.
 */
// ============================================
// Semaphore
// ============================================
/**
 * Counting semaphore for concurrent run control.
 *
 * - `acquire()` returns immediately if slots are available, otherwise queues.
 * - `release()` frees a slot and wakes the next queued waiter.
 * - `tryAcquire()` returns false instead of blocking.
 */
export class Semaphore {
    max;
    current = 0;
    queue = [];
    constructor(maxConcurrent) {
        if (maxConcurrent < 1) {
            throw new Error(`Semaphore max must be >= 1, got ${maxConcurrent}`);
        }
        this.max = maxConcurrent;
    }
    /** Current number of acquired slots */
    get activeCount() {
        return this.current;
    }
    /** Number of callers waiting in queue */
    get waitingCount() {
        return this.queue.length;
    }
    /** Maximum concurrent slots */
    get maxConcurrent() {
        return this.max;
    }
    /**
     * Acquire a slot. Resolves immediately if available,
     * otherwise waits in queue until released.
     */
    async acquire() {
        if (this.current < this.max) {
            this.current++;
            return;
        }
        return new Promise((resolve, reject) => {
            this.queue.push({ resolve, reject });
        });
    }
    /**
     * Try to acquire a slot without waiting.
     * Returns true if acquired, false if all slots are taken.
     */
    tryAcquire() {
        if (this.current < this.max) {
            this.current++;
            return true;
        }
        return false;
    }
    /**
     * Release a slot. Wakes the next queued waiter if any.
     */
    release() {
        if (this.queue.length > 0) {
            const waiter = this.queue.shift();
            // Slot transfers directly to the waiter (current stays the same)
            waiter.resolve();
        }
        else if (this.current > 0) {
            this.current--;
        }
    }
    /**
     * Reject all waiting callers with an error.
     * Used during shutdown.
     */
    rejectAll(reason) {
        const waiters = this.queue.splice(0, this.queue.length);
        const error = new Error(reason);
        for (const waiter of waiters) {
            waiter.reject(error);
        }
    }
}
//# sourceMappingURL=concurrency.js.map