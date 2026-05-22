import type {
  AdminInboxNotificationRecord,
  AdminPushSubscriptionRecord,
  EmailConfig,
  NotificationSettings,
  SMSConfig,
} from "@/types/notification";

type NotificationCenterStatus = {
  settings: NotificationSettings;
  inbox: {
    items: AdminInboxNotificationRecord[];
    unreadCount: number;
  };
  vapidPublicKey: string;
  webPushAvailable: boolean;
  subscriptions: AdminPushSubscriptionRecord[];
};

type NotificationSyncResult = {
  updated: boolean;
  skipped?: boolean;
};

let notificationSyncPromise: Promise<NotificationSyncResult> | null = null;
let notificationSyncAttempted = false;

async function parseJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || payload?.message || "Istek basarisiz oldu.");
  }

  return payload;
}

export const getNotificationSettings = async (): Promise<NotificationSettings> => {
  const response = await fetch("/api/settings?type=notification", {
    cache: "no-store",
  });
  const payload = await parseJsonResponse(response);
  return payload.notificationSettings as NotificationSettings;
};

export const updateNotificationSettings = async (settings: NotificationSettings): Promise<void> => {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "notification",
      notificationSettings: settings,
    }),
  });

  await parseJsonResponse(response);
};

export const testEmailConnection = async (
  config: EmailConfig,
  testEmail?: string,
): Promise<boolean> => {
  const response = await fetch("/api/admin/marketing/email/test", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      config,
      testEmail,
    }),
  });

  const payload = await response.json().catch(() => null);
  return Boolean(response.ok && payload?.success);
};

export const testSMSConnection = async (config: SMSConfig): Promise<boolean> => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  return Boolean(config.apiKey);
};

export async function getNotificationCenterStatus() {
  const response = await fetch("/api/admin/notifications/status", {
    cache: "no-store",
    credentials: "same-origin",
  });
  return parseJsonResponse(response) as Promise<NotificationCenterStatus>;
}

export async function syncNotificationCenter(options: { force?: boolean } = {}) {
  if (!options.force && notificationSyncAttempted) {
    return {
      updated: false,
      skipped: true,
    };
  }

  if (notificationSyncPromise) {
    return notificationSyncPromise;
  }

  notificationSyncAttempted = true;

  notificationSyncPromise = (async () => {
    const response = await fetch("/api/admin/notifications/sync", {
      method: "POST",
      credentials: "same-origin",
    });
    const payload = await parseJsonResponse(response);

    return {
      updated: Boolean(payload.updated),
    };
  })()
    .catch((error) => {
      notificationSyncAttempted = false;
      throw error;
    })
    .finally(() => {
      notificationSyncPromise = null;
    });

  return notificationSyncPromise;
}

export async function getNotificationInbox(limit = 25, unreadOnly = false) {
  const response = await fetch(
    `/api/admin/notifications/inbox?limit=${limit}&unreadOnly=${unreadOnly ? "true" : "false"}`,
    {
      cache: "no-store",
      credentials: "same-origin",
    },
  );

  return parseJsonResponse(response) as Promise<{
    items: AdminInboxNotificationRecord[];
    unreadCount: number;
  }>;
}

export async function markNotificationRead(notificationId: string) {
  const response = await fetch("/api/admin/notifications/inbox/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      notificationId,
    }),
  });

  await parseJsonResponse(response);
}

export async function markAllNotificationsRead() {
  const response = await fetch("/api/admin/notifications/inbox/read", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      all: true,
    }),
  });

  await parseJsonResponse(response);
}

export async function savePushSubscription(subscription: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
  platform?: string | null;
}) {
  const response = await fetch("/api/admin/notifications/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify(subscription),
  });

  await parseJsonResponse(response);
}

export async function deletePushSubscription(endpoint: string) {
  const response = await fetch("/api/admin/notifications/subscriptions", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({
      endpoint,
    }),
  });

  await parseJsonResponse(response);
}

export async function sendTestNotification() {
  const response = await fetch("/api/admin/notifications/test", {
    method: "POST",
    credentials: "same-origin",
  });

  await parseJsonResponse(response);
}
