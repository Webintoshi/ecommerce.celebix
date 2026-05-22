import "server-only";

import webpush from "web-push";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { getNotificationSettings } from "@/lib/db/settings";
import { isMissingProductReviewsTableError } from "@/lib/product-reviews";
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

type InboxStore = {
    items: AdminInboxNotificationRecord[];
};

type SubscriptionStore = {
    subscriptions: AdminPushSubscriptionRecord[];
};

type ReviewSyncStore = {
    bootstrappedAt: string | null;
    seenReviewIds: string[];
};

type WebPushRuntimeConfig = {
    publicKey: string;
    privateKey: string;
    subject: string;
};

type ProductReviewSyncRow = {
    id: string;
    product_id: string | null;
    reviewer_name: string | null;
    created_at: string;
};

const PRIVATE_SETTING_KEYS = {
    runtime: "__admin_internal__notification_runtime",
    inbox: "__admin_internal__notification_inbox",
    subscriptions: "__admin_internal__notification_subscriptions",
    reviewSync: "__admin_internal__notification_review_sync",
} as const;

const MAX_INBOX_ITEMS = 250;
const MAX_SYNCED_REVIEW_IDS = 250;
const REVIEW_SYNC_LIMIT = 25;

let cachedWebPushRuntimePromise: Promise<WebPushRuntimeConfig | null> | null = null;

function normalizeInboxRecord(value: unknown): AdminInboxNotificationRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const type = String(record.type || "") as NotificationEventType;
    if (!type) {
        return null;
    }

    return {
        id: String(record.id || ""),
        adminUserId: String(record.adminUserId || record.admin_user_id || ""),
        type,
        title: String(record.title || ""),
        body: String(record.body || ""),
        href: typeof record.href === "string" ? record.href : null,
        entityType: typeof record.entityType === "string"
            ? record.entityType
            : typeof record.entity_type === "string"
                ? record.entity_type
                : null,
        entityId: typeof record.entityId === "string"
            ? record.entityId
            : typeof record.entity_id === "string"
                ? record.entity_id
                : null,
        payload:
            record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
                ? (record.payload as Record<string, unknown>)
                : {},
        readAt: typeof record.readAt === "string"
            ? record.readAt
            : typeof record.read_at === "string"
                ? record.read_at
                : null,
        createdAt: String(record.createdAt || record.created_at || new Date().toISOString()),
    };
}

function normalizeSubscriptionRecord(value: unknown): AdminPushSubscriptionRecord | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const endpoint = String(record.endpoint || "");
    if (!endpoint) {
        return null;
    }

    return {
        id: String(record.id || ""),
        adminUserId: String(record.adminUserId || record.admin_user_id || ""),
        endpoint,
        p256dh: String(record.p256dh || ""),
        auth: String(record.auth || ""),
        userAgent: typeof record.userAgent === "string"
            ? record.userAgent
            : typeof record.user_agent === "string"
                ? record.user_agent
                : null,
        platform: typeof record.platform === "string" ? record.platform : null,
        disabledAt: typeof record.disabledAt === "string"
            ? record.disabledAt
            : typeof record.disabled_at === "string"
                ? record.disabled_at
                : null,
        lastSeenAt: typeof record.lastSeenAt === "string"
            ? record.lastSeenAt
            : typeof record.last_seen_at === "string"
                ? record.last_seen_at
                : null,
        createdAt: String(record.createdAt || record.created_at || new Date().toISOString()),
        updatedAt: String(record.updatedAt || record.updated_at || new Date().toISOString()),
    };
}

function normalizeInboxStore(value: unknown): InboxStore {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { items: [] };
    }

    const items = Array.isArray((value as { items?: unknown[] }).items)
        ? ((value as { items: unknown[] }).items
            .map((item) => normalizeInboxRecord(item))
            .filter((item): item is AdminInboxNotificationRecord => Boolean(item)))
        : [];

    return {
        items: items
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
            .slice(0, MAX_INBOX_ITEMS),
    };
}

function normalizeSubscriptionStore(value: unknown): SubscriptionStore {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return { subscriptions: [] };
    }

    const subscriptions = Array.isArray((value as { subscriptions?: unknown[] }).subscriptions)
        ? ((value as { subscriptions: unknown[] }).subscriptions
            .map((item) => normalizeSubscriptionRecord(item))
            .filter((item): item is AdminPushSubscriptionRecord => Boolean(item)))
        : [];

    return {
        subscriptions: subscriptions
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    };
}

function normalizeReviewSyncStore(value: unknown): ReviewSyncStore {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return {
            bootstrappedAt: null,
            seenReviewIds: [],
        };
    }

    const record = value as Record<string, unknown>;
    return {
        bootstrappedAt: typeof record.bootstrappedAt === "string" ? record.bootstrappedAt : null,
        seenReviewIds: Array.isArray(record.seenReviewIds)
            ? record.seenReviewIds
                .filter((item): item is string => typeof item === "string")
                .slice(0, MAX_SYNCED_REVIEW_IDS)
            : [],
    };
}

function normalizeRuntimeConfig(value: unknown): WebPushRuntimeConfig | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const record = value as Record<string, unknown>;
    const publicKey = typeof record.publicKey === "string" ? record.publicKey.trim() : "";
    const privateKey = typeof record.privateKey === "string" ? record.privateKey.trim() : "";
    const subject =
        typeof record.subject === "string" && record.subject.trim().length > 0
            ? record.subject.trim()
            : "mailto:destek@celebix.site";

    if (!publicKey || !privateKey) {
        return null;
    }

    return {
        publicKey,
        privateKey,
        subject,
    };
}

async function getPrivateSettingValue(key: string) {
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data?.value ?? null;
}

async function setPrivateSettingValue(key: string, value: Record<string, unknown>) {
    const supabase = createServiceSupabaseClient();
    const { error } = await supabase
        .from("settings")
        .upsert({ key, value }, { onConflict: "key" });

    if (error) {
        throw error;
    }
}

async function getInboxStore() {
    return normalizeInboxStore(await getPrivateSettingValue(PRIVATE_SETTING_KEYS.inbox));
}

async function saveInboxStore(store: InboxStore) {
    await setPrivateSettingValue(PRIVATE_SETTING_KEYS.inbox, store as unknown as Record<string, unknown>);
}

async function getSubscriptionStore() {
    return normalizeSubscriptionStore(await getPrivateSettingValue(PRIVATE_SETTING_KEYS.subscriptions));
}

async function saveSubscriptionStore(store: SubscriptionStore) {
    await setPrivateSettingValue(
        PRIVATE_SETTING_KEYS.subscriptions,
        store as unknown as Record<string, unknown>,
    );
}

async function getReviewSyncStore() {
    return normalizeReviewSyncStore(await getPrivateSettingValue(PRIVATE_SETTING_KEYS.reviewSync));
}

async function saveReviewSyncStore(store: ReviewSyncStore) {
    await setPrivateSettingValue(
        PRIVATE_SETTING_KEYS.reviewSync,
        store as unknown as Record<string, unknown>,
    );
}

async function getWebPushRuntime() {
    if (cachedWebPushRuntimePromise) {
        return cachedWebPushRuntimePromise;
    }

    cachedWebPushRuntimePromise = (async () => {
        const envPublicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || "";
        const envPrivateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim() || "";
        const envSubject = process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:destek@celebix.site";

        const envRuntime = normalizeRuntimeConfig({
            publicKey: envPublicKey,
            privateKey: envPrivateKey,
            subject: envSubject,
        });

        if (envRuntime) {
            webpush.setVapidDetails(envRuntime.subject, envRuntime.publicKey, envRuntime.privateKey);
            return envRuntime;
        }

        const storedRuntime = normalizeRuntimeConfig(
            await getPrivateSettingValue(PRIVATE_SETTING_KEYS.runtime),
        );

        if (storedRuntime) {
            webpush.setVapidDetails(
                storedRuntime.subject,
                storedRuntime.publicKey,
                storedRuntime.privateKey,
            );
            return storedRuntime;
        }

        const generated = webpush.generateVAPIDKeys();
        const runtime = {
            publicKey: generated.publicKey,
            privateKey: generated.privateKey,
            subject: "mailto:destek@celebix.site",
        };

        await setPrivateSettingValue(
            PRIVATE_SETTING_KEYS.runtime,
            runtime as unknown as Record<string, unknown>,
        );
        webpush.setVapidDetails(runtime.subject, runtime.publicKey, runtime.privateKey);
        return runtime;
    })().catch((error) => {
        cachedWebPushRuntimePromise = null;
        throw error;
    });

    return cachedWebPushRuntimePromise;
}

export async function isWebPushConfigured() {
    return Boolean(await getWebPushRuntime());
}

export async function getWebPushPublicKey() {
    return (await getWebPushRuntime())?.publicKey || "";
}

export async function listAdminInboxNotificationsForUser(
    adminUserId: string,
    options: {
        limit?: number;
        unreadOnly?: boolean;
    } = {},
) {
    const limit = Math.max(1, Math.min(options.limit ?? 25, 100));
    const store = await getInboxStore();

    const items = store.items.filter((item) => {
        if (item.adminUserId !== adminUserId) {
            return false;
        }

        if (options.unreadOnly && item.readAt) {
            return false;
        }

        return true;
    });

    return {
        items: items.slice(0, limit),
        unreadCount: store.items.filter((item) => item.adminUserId === adminUserId && !item.readAt).length,
    };
}

export async function markAdminInboxNotificationsRead(
    adminUserId: string,
    options: {
        notificationId?: string;
        all?: boolean;
    },
) {
    const store = await getInboxStore();
    const now = new Date().toISOString();

    const nextItems = store.items.map((item) => {
        if (item.adminUserId !== adminUserId || item.readAt) {
            return item;
        }

        if (options.all) {
            return {
                ...item,
                readAt: now,
            };
        }

        if (options.notificationId && item.id === options.notificationId) {
            return {
                ...item,
                readAt: now,
            };
        }

        return item;
    });

    await saveInboxStore({
        items: nextItems,
    });

    return true;
}

export async function registerAdminPushSubscription(
    adminUserId: string,
    subscription: PushSubscriptionInput,
) {
    const store = await getSubscriptionStore();
    const now = new Date().toISOString();
    const existing = store.subscriptions.find((item) => item.endpoint === subscription.endpoint);

    const nextRecord: AdminPushSubscriptionRecord = {
        id: existing?.id || crypto.randomUUID(),
        adminUserId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        userAgent: subscription.userAgent || null,
        platform: subscription.platform || null,
        disabledAt: null,
        lastSeenAt: now,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    };

    const nextSubscriptions = [
        nextRecord,
        ...store.subscriptions.filter((item) => item.endpoint !== subscription.endpoint),
    ];

    await saveSubscriptionStore({
        subscriptions: nextSubscriptions,
    });

    return nextRecord;
}

export async function disableAdminPushSubscription(
    adminUserId: string,
    endpoint: string,
) {
    const store = await getSubscriptionStore();
    const now = new Date().toISOString();

    await saveSubscriptionStore({
        subscriptions: store.subscriptions.map((item) =>
            item.endpoint === endpoint && item.adminUserId === adminUserId
                ? {
                    ...item,
                    disabledAt: now,
                    lastSeenAt: now,
                    updatedAt: now,
                }
                : item,
        ),
    });

    return true;
}

async function getActivePushSubscriptions() {
    const store = await getSubscriptionStore();
    return store.subscriptions
        .filter((item) => !item.disabledAt)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

async function disablePushSubscriptionByEndpoint(endpoint: string) {
    const store = await getSubscriptionStore();
    const now = new Date().toISOString();

    await saveSubscriptionStore({
        subscriptions: store.subscriptions.map((item) =>
            item.endpoint === endpoint
                ? {
                    ...item,
                    disabledAt: now,
                    lastSeenAt: now,
                    updatedAt: now,
                }
                : item,
        ),
    });
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

    const store = await getInboxStore();
    const createdAt = new Date().toISOString();
    const nextItems = [
        ...adminUserIds.map<AdminInboxNotificationRecord>((adminUserId) => ({
            id: crypto.randomUUID(),
            adminUserId,
            type: input.type,
            title: input.title,
            body: input.body,
            href: input.href || null,
            entityType: input.entityType || null,
            entityId: input.entityId || null,
            payload: input.payload || {},
            readAt: null,
            createdAt,
        })),
        ...store.items,
    ].slice(0, MAX_INBOX_ITEMS);

    await saveInboxStore({
        items: nextItems,
    });

    return nextItems.slice(0, adminUserIds.length);
}

async function sendPushNotifications(
    subscriptions: AdminPushSubscriptionRecord[],
    input: EmitAdminNotificationInput,
) {
    if (subscriptions.length === 0) {
        return;
    }

    const runtime = await getWebPushRuntime();
    if (!runtime) {
        return;
    }

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
                    await disablePushSubscriptionByEndpoint(subscription.endpoint);
                    return;
                }

                console.error("Web push delivery failed:", error);
            }
        }),
    );
}

export async function syncNewProductReviewNotifications() {
    const settings = await getNotificationSettings();
    if (!settings.push.events.new_product_review) {
        return false;
    }

    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
        .from("product_reviews")
        .select("id, product_id, reviewer_name, created_at")
        .order("created_at", { ascending: false })
        .limit(REVIEW_SYNC_LIMIT);

    if (error) {
        if (isMissingProductReviewsTableError(error)) {
            return false;
        }
        console.error("Product review notification sync failed:", error);
        throw error;
    }

    const reviews = ((data || []) as ProductReviewSyncRow[]).filter((review) => review.id);
    if (reviews.length === 0) {
        return false;
    }

    const syncStore = await getReviewSyncStore();
    const currentIds = reviews.map((review) => review.id);

    if (!syncStore.bootstrappedAt) {
        await saveReviewSyncStore({
            bootstrappedAt: new Date().toISOString(),
            seenReviewIds: currentIds.slice(0, MAX_SYNCED_REVIEW_IDS),
        });
        return false;
    }

    const seenIds = new Set(syncStore.seenReviewIds);
    const unseenReviews = reviews
        .filter((review) => !seenIds.has(review.id))
        .sort((left, right) => left.created_at.localeCompare(right.created_at));

    if (unseenReviews.length === 0) {
        await saveReviewSyncStore({
            bootstrappedAt: syncStore.bootstrappedAt,
            seenReviewIds: [...new Set([...currentIds, ...syncStore.seenReviewIds])].slice(
                0,
                MAX_SYNCED_REVIEW_IDS,
            ),
        });
        return false;
    }

    const adminUserIds = await getAdminRecipientIds();
    const subscriptions = settings.push.webPushEnabled
        ? await getActivePushSubscriptions()
        : [];

    for (const review of unseenReviews) {
        const reviewerName = review.reviewer_name?.trim() || "Musteri";
        const eventInput: EmitAdminNotificationInput = {
            type: "new_product_review",
            title: "Yeni urun yorumu",
            body: `${reviewerName} yeni bir yorum gonderdi.`,
            href: "/admin/urunler/yorumlar",
            entityType: "product_review",
            entityId: review.id,
            payload: {
                productId: review.product_id,
                reviewId: review.id,
                source: "review_sync",
            },
        };

        if (settings.push.inboxEnabled) {
            await createInboxNotifications(adminUserIds, eventInput);
        }

        if (subscriptions.length > 0) {
            await sendPushNotifications(subscriptions, eventInput);
        }
    }

    await saveReviewSyncStore({
        bootstrappedAt: syncStore.bootstrappedAt,
        seenReviewIds: [...new Set([...currentIds, ...syncStore.seenReviewIds])].slice(
            0,
            MAX_SYNCED_REVIEW_IDS,
        ),
    });

    return true;
}

export async function getAdminNotificationStatus(adminUserId: string) {
    const [settings, inboxSummary, subscriptions, publicKey] = await Promise.all([
        getNotificationSettings(),
        listAdminInboxNotificationsForUser(adminUserId, { limit: 12 }),
        getActivePushSubscriptions(),
        getWebPushPublicKey(),
    ]);

    return {
        settings,
        inbox: inboxSummary,
        vapidPublicKey: publicKey,
        webPushAvailable: Boolean(publicKey),
        subscriptions: subscriptions.filter((item) => item.adminUserId === adminUserId).slice(0, 5),
    };
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

    if (settings.push.webPushEnabled) {
        await sendPushNotifications(await getActivePushSubscriptions(), input);
    }

    return {
        delivered: true,
        inboxCount: inboxItems.length,
    };
}
