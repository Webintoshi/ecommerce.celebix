import { NextRequest, NextResponse } from "next/server";
import type { EmailConfig } from "@/types/notification";
import { getNotificationSettings } from "@/lib/db/settings";
import { formatResendFromAddress, sendResendEmail } from "@/lib/resend";

function normalizeEmailConfig(input: EmailConfig) {
  return {
    ...input,
    provider: input.provider || "resend",
    senderName: String(input.senderName || "").trim(),
    senderEmail: String(input.senderEmail || "").trim(),
    replyTo: String(input.replyTo || "").trim(),
    apiKey: String(input.apiKey || "").trim(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const notificationSettings = await getNotificationSettings();
    const config = normalizeEmailConfig(body.config || notificationSettings.email);
    const testEmail = String(body.testEmail || config.senderEmail || "").trim();

    if (config.provider !== "resend") {
      return NextResponse.json(
        { success: false, error: "Test gonderimi su anda yalnizca Resend ile desteklenir." },
        { status: 422 },
      );
    }

    if (!config.apiKey) {
      return NextResponse.json(
        { success: false, error: "Resend API anahtari gereklidir." },
        { status: 422 },
      );
    }

    if (!testEmail) {
      return NextResponse.json(
        { success: false, error: "Test e-postasi gonderilecek alici bulunamadi." },
        { status: 422 },
      );
    }

    await sendResendEmail({
      apiKey: config.apiKey,
      from: formatResendFromAddress(config),
      to: testEmail,
      subject: `${config.senderName || "Celebix"} Resend baglanti testi`,
      html: "<p>Bu bir Resend baglanti testidir. Gonderim basariyla calisiyor.</p>",
      text: "Bu bir Resend baglanti testidir. Gonderim basariyla calisiyor.",
      replyTo: config.replyTo || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Test e-postasi ${testEmail} adresine gonderildi.`,
    });
  } catch (error) {
    console.error("Error testing Resend email connection:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Resend test gonderimi basarisiz.",
      },
      { status: 500 },
    );
  }
}
