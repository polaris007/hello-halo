/**
 * Notify Channels — WeCom (企业微信) Channel
 *
 * Sends notifications via WeCom self-built app API.
 * Uses access token auth with automatic refresh.
 *
 * API docs: https://developer.work.weixin.qq.com/document/
 */
import { TokenManager, withTokenRetry } from './token-manager';
const WECOM_API_BASE = 'https://qyapi.weixin.qq.com/cgi-bin';
// Singleton token managers per corpId+secret
const tokenManagers = new Map();
function getTokenManager(config) {
    const key = `${config.corpId}:${config.agentId}`;
    let manager = tokenManagers.get(key);
    if (!manager) {
        manager = new TokenManager('WeCom', async () => {
            const url = `${WECOM_API_BASE}/gettoken?corpid=${encodeURIComponent(config.corpId)}&corpsecret=${encodeURIComponent(config.secret)}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.errcode !== 0) {
                throw new Error(`WeCom gettoken failed: ${data.errcode} ${data.errmsg}`);
            }
            return { token: data.access_token, expiresIn: data.expires_in };
        });
        tokenManagers.set(key, manager);
    }
    return manager;
}
/**
 * Send a notification via WeCom self-built app.
 * Uses markdown format for richer display, falls back to text.
 */
export async function sendWecom(config, payload) {
    const channel = 'wecom';
    const toUser = config.defaultToUser || '@all';
    console.log(`[NotifyChannel][WeCom] Sending to=${toUser}, title="${payload.title}"`);
    try {
        const manager = getTokenManager(config);
        const timestamp = new Date(payload.timestamp).toLocaleString();
        // Build markdown message (WeCom supports limited markdown)
        const markdownContent = [
            `**${payload.title}**`,
            payload.body,
            '',
            `<font color="comment">${payload.appName ? `App: ${payload.appName} | ` : ''}${timestamp}</font>`,
        ].join('\n');
        // WeCom markdown cannot be sent to @all, so use text for @all
        const useMarkdown = toUser !== '@all';
        const body = {
            ...(toUser === '@all' ? { touser: '@all' } : { touser: toUser }),
            ...(config.defaultToParty ? { toparty: config.defaultToParty } : {}),
            msgtype: useMarkdown ? 'markdown' : 'text',
            agentid: config.agentId,
            ...(useMarkdown
                ? { markdown: { content: markdownContent } }
                : { text: { content: `${payload.title}\n${payload.body}\n${payload.appName ? `App: ${payload.appName} | ` : ''}${timestamp}` } }),
        };
        const result = await withTokenRetry(manager, async (token) => {
            const url = `${WECOM_API_BASE}/message/send?access_token=${token}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return res.json();
        });
        if (result.errcode !== 0) {
            throw new Error(`WeCom send failed: ${result.errcode} ${result.errmsg}`);
        }
        console.log(`[NotifyChannel][WeCom] Sent successfully`);
        return { channel, success: true };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[NotifyChannel][WeCom] Failed:`, message);
        return { channel, success: false, error: message };
    }
}
/**
 * Test WeCom connection by fetching a token.
 */
export async function testWecom(config) {
    try {
        const manager = getTokenManager(config);
        manager.invalidate();
        await manager.getToken();
        return { success: true };
    }
    catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
}
/**
 * Clear cached token managers (e.g., when config changes).
 */
export function clearWecomTokenCache() {
    tokenManagers.clear();
}
//# sourceMappingURL=wecom.js.map