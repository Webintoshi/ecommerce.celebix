import { NextRequest, NextResponse } from "next/server";
import { requireLegacyAdminApi } from "@/lib/legacy-admin-api-auth";
import { redactEmailSettings, restoreEmailSettings } from "@/lib/legacy-settings-secrets";
import {
  getEmailMarketingSettings,
  getNotificationSettings,
  setEmailMarketingSettings,
  setNotificationSettings,
} from "@/lib/db/settings";

export async function GET(request: NextRequest) {
  const denied = await requireLegacyAdminApi(request, "settings");
  if (denied) return denied;

  try {
    const [notificationSettings, marketingSettings] = await Promise.all([
      getNotificationSettings(),
      getEmailMarketingSettings(),
    ]);

    return NextResponse.json({
      success: true,
      emailSettings: redactEmailSettings(notificationSettings.email),
      marketingSettings,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error loading email marketing settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "E-posta ayarları alınamadı.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireLegacyAdminApi(request, "settings");
  if (denied) return denied;

  try {
    const body = await request.json();
    const [currentNotificationSettings] = await Promise.all([
      getNotificationSettings(),
    ]);

    if (body.emailSettings) {
      await setNotificationSettings({
        ...currentNotificationSettings,
        email: restoreEmailSettings({
          ...currentNotificationSettings.email,
          ...body.emailSettings,
        }, currentNotificationSettings.email),
      });
    }

    if (body.marketingSettings) {
      await setEmailMarketingSettings(body.marketingSettings);
    }

    const [notificationSettings, marketingSettings] = await Promise.all([
      getNotificationSettings(),
      getEmailMarketingSettings(),
    ]);

    return NextResponse.json({
      success: true,
      emailSettings: redactEmailSettings(notificationSettings.email),
      marketingSettings,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Error saving email marketing settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: "E-posta ayarları kaydedilemedi.",
      },
      { status: 500 },
    );
  }
}
