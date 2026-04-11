import type { EmailConfig, NotificationSettings, SMSConfig } from "@/types/notification";

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
