export interface EmailConfig {
    provider: "smtp" | "aws-ses" | "resend";
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    password?: string;
    senderName: string;
    senderEmail: string;
    replyTo?: string;
    apiKey?: string; // For API-based providers
}

export interface SMSConfig {
    provider: "netgsm" | "iletimerkezi" | "twilio";
    apiKey: string;
    apiSecret?: string;
    senderTitle: string;
}

export type NotificationEventType =
    | "new_order"
    | "new_product_review"
    | "payment_failed";

export interface PushEventMatrix {
    new_order: boolean;
    new_product_review: boolean;
    payment_failed: boolean;
}

export interface PushConfig {
    enabled: boolean;
    webPushEnabled: boolean;
    inboxEnabled: boolean;
    permissionPrompt: "manual" | "disabled";
    appBadgeEnabled: boolean;
    events: PushEventMatrix;
}

export interface NotificationSettings {
    email: EmailConfig;
    sms: SMSConfig;
    push: PushConfig;
}

export interface AdminPushSubscriptionRecord {
    id: string;
    adminUserId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent: string | null;
    platform: string | null;
    disabledAt: string | null;
    lastSeenAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface AdminInboxNotificationRecord {
    id: string;
    adminUserId: string;
    type: NotificationEventType;
    title: string;
    body: string;
    href: string | null;
    entityType: string | null;
    entityId: string | null;
    payload: Record<string, unknown>;
    readAt: string | null;
    createdAt: string;
}
