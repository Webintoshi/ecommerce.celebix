import { NextRequest, NextResponse } from "next/server";
import {
  getEmailMarketingSettings,
  getNotificationSettings,
  setEmailMarketingSettings,
  setNotificationSettings,
} from "@/lib/db/settings";

export async function GET() {
  try {
    const [notificationSettings, marketingSettings] = await Promise.all([
      getNotificationSettings(),
      getEmailMarketingSettings(),
    ]);

    return NextResponse.json({
      success: true,
      emailSettings: notificationSettings.email,
      marketingSettings,
    });
  } catch (error) {
    console.error("Error loading email marketing settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "E-posta ayarlari yuklenemedi.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [currentNotificationSettings] = await Promise.all([
      getNotificationSettings(),
    ]);

    if (body.emailSettings) {
      await setNotificationSettings({
        ...currentNotificationSettings,
        email: {
          ...currentNotificationSettings.email,
          ...body.emailSettings,
        },
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
      emailSettings: notificationSettings.email,
      marketingSettings,
    });
  } catch (error) {
    console.error("Error saving email marketing settings:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "E-posta ayarlari kaydedilemedi.",
      },
      { status: 500 },
    );
  }
}
