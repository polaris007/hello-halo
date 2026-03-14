/**
 * Notify Channels — Generic Webhook Channel
 *
 * Sends notifications via HTTP POST to a user-specified endpoint.
 * Supports optional HMAC-SHA256 signing for verification.
 */
import { createHmac } from 'crypto';
/**
 * Send a notification via HTTP webhook.
 */
export async function sendWebhook(config, payload) {
    const channel = 'webhook';
    console.log(`[NotifyChannel][Webhook] Sending to url=${config.url}, title="${payload.title}"`);
    try {
        const body = JSON.stringify({
            event: 'notification',
            title: payload.title,
            body: payload.body,
            appId: payload.appId,
            appName: payload.appName,
            timestamp: payload.timestamp,
        });
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Halo/1.0',
            ...config.headers,
        };
        // Add HMAC signature if secret is configured
        if (config.secret) {
            const signature = createHmac('sha256', config.secret)
                .update(body)
                .digest('hex');
            headers['X-Halo-Signature'] = `sha256=${signature}`;
        }
        const method = config.method || 'POST';
        const res = await fetch(config.url, {
            method,
            headers,
            body,
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        console.log(`[NotifyChannel][Webhook] Sent successfully, status=${res.status}`);
        return { channel, success: true };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[NotifyChannel][Webhook] Failed:`, message);
        return { channel, success: false, error: message };
    }
}
/**
 * Test webhook connection by sending a test payload.
 */
export async function testWebhook(config) {
    try {
        const testPayload = {
            title: 'Halo Test',
            body: 'This is a test notification from Halo.',
            timestamp: Date.now(),
        };
        const result = await sendWebhook(config, testPayload);
        return { success: result.success, error: result.error };
    }
    catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
//# sourceMappingURL=webhook.js.map