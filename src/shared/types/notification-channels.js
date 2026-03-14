/**
 * Notification Channels — Shared type definitions
 *
 * Used by both main process and renderer process.
 * Must NOT import any Node.js or Electron APIs.
 *
 * Defines the configuration schema for external notification channels
 * (email, WeCom, DingTalk, Feishu, webhook).
 */
/** Display metadata for each channel */
export const NOTIFICATION_CHANNEL_META = {
    email: {
        labelKey: 'Email',
        descriptionKey: 'Send notifications via SMTP email',
    },
    wecom: {
        labelKey: 'WeCom',
        descriptionKey: 'Send notifications via WeChat Work (企业微信)',
    },
    dingtalk: {
        labelKey: 'DingTalk',
        descriptionKey: 'Send notifications via DingTalk (钉钉)',
    },
    feishu: {
        labelKey: 'Feishu',
        descriptionKey: 'Send notifications via Feishu/Lark (飞书)',
    },
    webhook: {
        labelKey: 'Webhook',
        descriptionKey: 'Send notifications via HTTP webhook',
    },
};
//# sourceMappingURL=notification-channels.js.map