import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { getNotificationSettings } from "@/lib/db/settings";
import { formatResendFromAddress, sendResendEmail } from "@/lib/resend";
import { renderEmailTemplate } from "@/lib/email-marketing";

const payloadSchema = z.object({
  customerIds: z.array(z.string().min(1)).min(1).max(250),
  subject: z.string().trim().min(1).max(200),
  bodyHtml: z.string().trim().min(1).max(120_000),
});

async function sendInChunks<T>(
  items: T[],
  chunkSize: number,
  handler: (item: T) => Promise<void>,
) {
  const results: Array<{ success: boolean; error?: string }> = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    const chunk = items.slice(index, index + chunkSize);
    const settled = await Promise.allSettled(chunk.map((item) => handler(item)));

    for (const result of settled) {
      if (result.status === "fulfilled") {
        results.push({ success: true });
      } else {
        results.push({
          success: false,
          error: result.reason instanceof Error ? result.reason.message : "Gonderim basarisiz.",
        });
      }
    }
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = payloadSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Gecersiz kampanya verisi." },
        { status: 422 },
      );
    }

    const notificationSettings = await getNotificationSettings();
    const emailConfig = notificationSettings.email;

    if (emailConfig.provider !== "resend") {
      return NextResponse.json(
        { success: false, error: "Kampanya gonderimi icin Resend secilmelidir." },
        { status: 422 },
      );
    }

    if (!emailConfig.apiKey?.trim()) {
      return NextResponse.json(
        { success: false, error: "Resend API anahtari tanimlanmamis." },
        { status: 422 },
      );
    }

    const supabase = createServerClient();
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id,email,first_name,last_name,accepts_email_marketing")
      .in("id", parsed.data.customerIds);

    if (error) {
      throw error;
    }

    const recipients = (customers || [])
      .filter((customer) => typeof customer.email === "string" && customer.email.trim().length > 0)
      .map((customer) => ({
        id: String(customer.id),
        email: String(customer.email || "").trim(),
        firstName: String(customer.first_name || "").trim(),
        lastName: String(customer.last_name || "").trim(),
        acceptsEmailMarketing: Boolean(customer.accepts_email_marketing),
      }));

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: "Gonderilecek gecerli e-posta alicisi bulunamadi." },
        { status: 422 },
      );
    }

    const results = await sendInChunks(recipients, 10, async (recipient) => {
      const rendered = renderEmailTemplate(
        {
          subject: parsed.data.subject,
          bodyHtml: parsed.data.bodyHtml,
        },
        recipient,
      );

      await sendResendEmail({
        apiKey: String(emailConfig.apiKey),
        from: formatResendFromAddress(emailConfig),
        to: recipient.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        replyTo: emailConfig.replyTo || undefined,
      });
    });

    const delivered = results.filter((result) => result.success).length;
    const failed = results.filter((result) => !result.success);

    return NextResponse.json({
      success: failed.length === 0,
      delivered,
      failed: failed.length,
      errors: failed.slice(0, 10).map((result) => result.error || "Gonderim basarisiz."),
    });
  } catch (error) {
    console.error("Error sending marketing emails:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Kampanya gonderimi basarisiz.",
      },
      { status: 500 },
    );
  }
}
