import { NextRequest, NextResponse } from "next/server";
import { getAccountingProviderDefinition, isAccountingProvider } from "@/lib/accounting-providers";
import { verifyAccountingWebhook } from "@/lib/accounting-webhook-authority";
import { recordAccountingWebhook } from "@/lib/db/accounting";

interface Params {
  params: Promise<{ provider: string }>;
}

async function readNotification(request: Request): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new TypeError("invalid_notification");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 64 * 1024) {
        await reader.cancel();
        throw new TypeError("invalid_notification");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, length);
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider) || !getAccountingProviderDefinition(provider)?.supportsWebhook) {
      return NextResponse.json({ success: false, error: "Gecersiz saglayici." }, { status: 404 });
    }

    const secret = process.env[`ACCOUNTING_WEBHOOK_SECRET_${provider.toUpperCase()}`];
    if (!secret) return NextResponse.json({ success: false, error: "Webhook yapılandırılmamış." }, { status: 503 });
    const timestamp = request.headers.get("x-celebix-webhook-timestamp");
    const signature = request.headers.get("x-celebix-webhook-signature");
    if (!timestamp || !signature) return NextResponse.json({ success: false, error: "Webhook doğrulanamadı." }, { status: 401 });
    const body = await readNotification(request);
    if (!verifyAccountingWebhook({ body, timestamp, signature }, secret)) {
      return NextResponse.json({ success: false, error: "Webhook doğrulanamadı." }, { status: 401 });
    }
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("invalid_notification");
    await recordAccountingWebhook(provider, payload as Record<string, unknown>, {});

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "Geçersiz webhook bildirimi." }, { status: 400 });
    }
    console.error("Accounting webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Webhook işlenemedi.",
      },
      { status: 500 },
    );
  }
}

