import "server-only";

import webpush from "web-push";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { getNotificationSettings } from "@/lib/db/settings";
import type {
    AdminInboxNotificationRecord,
    AdminPushSubscriptionRecord,
    NotificationEventType,
} from "@/types/notification";

type PushSubscriptionInput = {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
    platform?: string | null;
};

type EmitAdminNotificationInput = {
    type: NotificationEventType;
    title: string;
    body: string;
    href?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    payload?: Record<string, unknown>;
    force?: boolean;
};

type InboxRow = {
    id: string;
    admin_user_id: string;
    type: string;
    title: string;
    body: string;
    href: string | null;
    entity_type: string | null;
    entity_id: string | null;
    payload: Record<string, unknown> | null;
    read_at: string | null;
    created_at: string;
};

type SubscriptionRow = {
    id: string;
    admin_user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    user_agent: string | null;
    platform: string | null;
    last_seen_at: string | null;
    disabled_at: string | null;
    created_at: string;
    updated_at: string;
};

type WebPushRuntimeConfig = {
    publicKey: string;
    privateKey: string;
    subject: string;
};

let cachedWebPushRuntime: WebPushRuntimeConfig | null | undefined;

function readWebPushRuntime(): WebPushRuntimeConfig | null {
    if (cachedWebPushRuntime !== undefined) {
        return cachedWebPushRuntime;
    }

    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
    const subject = process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:destek@celebix.site";

    if (!publicKey || !privateKey) {
        cachedWebPushRuntime = null;
        return cachedWebPushRuntime;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    cachedWebPushRuntime = {
        publicKey,
        privateKey,
        subject,
    };
    return cachedWebPushRuntime;
}

export function isWebPushConfigured() {
    return Boolean(readWebPushRuntime());
}

export function getWebPushPublicKey() {
    return readWebPushRuntime()?.publicKey || "";
}

function normalizeInboxRecord(row: InboxRow): AdminInboxNotificationRecord {
    return {
        id: row.id,
        adminUserId: row.admin_user_id,
        type: row.type as NotificationEventType,
        title: row.title,
        body: row.body,
        href: row.href,
        entityType: row.entity_type,
        entityId: row.entity_id,
        payload: row.payload || {},
        readAt: row.read_at,
        createdAt: row.created_at,
    };
}

function normalizeSubscriptionRecord(row: SubscriptionRow): AdminPushSubscriptionRecord {
    return {
        id: row.id,
        adminUserId: row.admin_user_id,
        endpoint: row.endpoint,
        p256dh: row.p256dh,
        auth: row.auth,
        userAgent: row.user_agent,
        platform: row.platform,
        lastSeenAt: row.last_seen_at,
        disabledAt: row.disabled_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function listAdminInboxNotificationsForUser(
    adminUserId: string,
    options: {
        limit?: number;
        unreadOnly?: boolean;
    } = {},
) {
    const supabase = createServiceSupabaseClient();
    const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
    let query = supabase
        .from("admin_inbox_notifications")
        .select("id,admin_user_id,type,title,body,href,entity_type,entity_id,payload,read_at,created_at")
        .eq("admin_user_id", adminUserId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (options.unreadOnly) {
        query = query.is("read_at", null);
    }

    const [inboxResponse, unreadResponse] = await Promise.all([
        query,
        supabase
            .from("admin_inbox_notifications")
            .select("id", { count: "exact", head: true })
            .eq("admin_user_id", adminUserId)
            .is("read_at", null),
    ]);

    if (inboxResponse.error) {
        throw inboxResponse.error;
    }

    if (unreadResponse.error) {
        throw unreadResponse.error;
    }

    return {
        items: ((inboxResponse.data || []) as InboxRow[]).map(normalizeInboxRecord),
        unreadCount: Number(unreadResponse.count || 0),
    };
}

export async function markAdminInboxNotificationsRead(
    adminUserId: string,
    options: {
        notificationId?: string;
        all?: boolean;
    },
) {
    const supabase = createServiceSupabaseClient();
    const now = new Date().toISOString();
    let query = supabase
        .from("admin_inbox_notifications")
        .update({ read_at: now })
        .eq("admin_user_id", adminUserId)
        .is("read_at", null);

    if (options.all) {
        const { error } = await query;
        if (error) {
            throw error;
        }
        return true;
    }

    if (!options.notificationId) {
        return false;
    }

    const { error } = await query.eq("id", options.notificationId);
    if (error) {
        throw error;
    }

    return true;
}

export async function registerAdminPushSubscription(
    adminUserId: string,
    subscription: PushSubscriptionInput,
) {
    const supabase = createServiceSupabaseClient();
    const now = new Date().toISOString();
    const payload = {
        admin_user_id: adminUserId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: subscription.userAgent || null,
        platform: subscription.platform || null,
        last_seen_at: now,
        disabled_at: null,
    };

    const { data, error } = await supabase
        .from("admin_push_subscriptions")
        .upsert(payload, { onConflict: "endpoint" })
        .select("id,admin_user_id,endpoint,p256dh,auth,user_agent,platform,last_seen_at,disabled_at,created_at,updated_at")
        .single();

    if (error) {
        throw error;
    }

    return normalizeSubscriptionRecord(data as SubscriptionRow);
}

export async function disableAdminPushSubscription(
    adminUserId: string,
    endpoint: string,
) {
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
        .from("admin_push_subscriptions")
        .update({
            disabled_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
        })
        .eq("admin_user_id", adminUserId)
        .eq("endpoint", endpoint);

    if (error) {
        throw error;
    }

    return true;
}

export async function getAdminNotificationStatus(adminUserId: string) {
    const [settings, inboxSummary, subscriptionsResponse] = await Promise.all([
        getNotificationSettings(),
        listAdminInboxNotificationsForUser(adminUserId, { limit: 12 }),
        createServiceSupabaseClient()
            .from("admin_push_subscriptions")
            .select("id,admin_user_id,endpoint,p256dh,auth,user_agent,platform,last_seen_at,disabled_at,created_at,updated_at")
            .eq("admin_user_id", adminUserId)
            .is("disabled_at", null)
            .order("updated_at", { ascending: false })
            .limit(5),
    ]);

    if (subscriptionsResponse.error) {
        throw subscriptionsResponse.error;
    }

    return {
        settings,
        inbox: inboxSummary,
        vapidPublicKey: getWebPushPublicKey(),
        webPushAvailable: isWebPushConfigured(),
        subscriptions: ((subscriptionsResponse.data || []) as SubscriptionRow[]).map(
            normalizeSubscriptionRecord,
        ),
    };
}

async function getAdminRecipientIds() {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
        .from("profiles")
        .select("id");

    if (error) {
        throw error;
    }

    return (data || []).map((row) => String(row.id)).filter(Boolean);
}

async function createInboxNotifications(
    adminUserIds: string[],
    input: EmitAdminNotificationInput,
) {
    if (adminUserIds.length === 0) {
        return [];
    }

    const supabase = createServiceSupabaseClient();
    const rows = adminUserIds.map((adminUserId) => ({
        admin_user_id: adminUserId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href || null,
        entity_type: input.entityType || null,
        entity_id: input.entityId || null,
        payload: input.payload || {},
    }));

    const { data, error } = await supabase
        .from("admin_inbox_notifications")
        .insert(rows)
        .select("id,admin_user_id,type,title,body,href,entity_type,entity_id,payload,read_at,created_at");

    if (error) {
        throw error;
    }

    return ((data || []) as InboxRow[]).map(normalizeInboxRecord);
}

async function sendPushNotifications(
    subscriptions: SubscriptionRow[],
    input: EmitAdminNotificationInput,
) {
    if (subscriptions.length === 0 || !isWebPushConfigured()) {
        return;
    }

    const supabase = createServiceSupabaseClient();
    const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        href: input.href || "/admin",
        type: input.type,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        payload: input.payload || {},
        tag: input.entityId ? `${input.type}:${input.entityId}` : input.type,
        badge: "/pwa/admin-icon-maskable.svg",
        icon: "/pwa/admin-icon.svg",
    });

    await Promise.all(
        subscriptions.map(async (subscription) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: subscription.endpoint,
                        keys: {
                            p256dh: subscription.p256dh,
                            auth: subscription.auth,
                        },
                    },
                    payload,
                );
            } catch (error) {
                const statusCode =
                    typeof error === "object" && error && "statusCode" in error
                        ? Number((error as { statusCode?: number }).statusCode)
                        : null;

                if (statusCode === 404 || statusCode === 410) {
                    await supabase
                        .from("admin_push_subscriptions")
                        .update({
                            disabled_at: new Date().toISOString(),
                            last_seen_at: new Date().toISOString(),
                        })
                        .eq("endpoint", subscription.endpoint);
                    return;
                }

                console.error("Web push delivery failed:", error);
            }
        }),
    );
}

export async function emitAdminNotificationEvent(input: EmitAdminNotificationInput) {
    const settings = await getNotificationSettings();
    const eventEnabled = settings.push.events[input.type];

    if (!input.force && (!settings.push.enabled || !eventEnabled)) {
        return {
            delivered: false,
            reason: "notifications_disabled",
        };
    }

    const adminUserIds = await getAdminRecipientIds();
    const inboxItems = settings.push.inboxEnabled
        ? await createInboxNotifications(adminUserIds, input)
        : [];

    if (settings.push.webPushEnabled && isWebPushConfigured()) {
        const supabase = createServiceSupabaseClient();
        const { data, error } = await supabase
            .from("admin_push_subscriptions")
            .select("id,admin_user_id,endpoint,p256dh,auth,user_agent,platform,last_seen_at,disabled_at,created_at,updated_at")
            .in("admin_user_id", adminUserIds)
            .is("disabled_at", null);

        if (error) {
            throw error;
        }

        await sendPushNotifications((data || []) as SubscriptionRow[], input);
    }

    return {
        delivered: true,
        inboxCount: inboxItems.length,
    };
}
