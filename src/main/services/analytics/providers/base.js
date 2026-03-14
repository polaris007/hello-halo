/**
 * Analytics Provider - Base Class
 *
 * Base class for all analytics providers
 * Provides common functionality: retry, timeout, error handling
 */
const DEFAULT_OPTIONS = {
    timeout: 10000, // 10 second timeout
    maxRetries: 2, // Max 2 retries
    debug: false
};
/**
 * Analytics Provider base class
 */
export class BaseProvider {
    _initialized = false;
    _userId = '';
    options;
    constructor(options) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
    }
    get initialized() {
        return this._initialized;
    }
    /**
     * Initialize provider
     */
    async init(userId) {
        this._userId = userId;
        this._initialized = true;
        this.log(`initialized with userId: ${userId.slice(0, 8)}...`);
    }
    /**
     * HTTP request with retry
     */
    async fetchWithRetry(url, options, retries = this.options.maxRetries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            // Retry if request failed and retries remaining
            if (!response.ok && retries > 0) {
                this.log(`request failed with ${response.status}, retrying... (${retries} left)`);
                return this.fetchWithRetry(url, options, retries - 1);
            }
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            // Retry on timeout or network error if retries remaining
            if (retries > 0) {
                this.log(`request error: ${error}, retrying... (${retries} left)`);
                return this.fetchWithRetry(url, options, retries - 1);
            }
            throw error;
        }
    }
    /**
     * Safe track (won't throw exceptions)
     */
    async safeTrack(trackFn) {
        try {
            await trackFn();
        }
        catch (error) {
            // Silent failure, only log
            this.log(`track failed: ${error}`);
        }
    }
    /**
     * Log output
     */
    log(message) {
        if (this.options.debug || process.env.NODE_ENV === 'development') {
            console.log(`[Analytics:${this.name}] ${message}`);
        }
    }
}
//# sourceMappingURL=base.js.map