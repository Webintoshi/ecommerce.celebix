import { NextRequest, NextResponse } from "next/server";
import { isAccountingProvider } from "@/lib/accounting-providers";
import { recordAccountingWebhook } from "@/lib/db/accounting";

interface Params {
  params: Promise<{ provider: string }>;
}

function collectHeaders(headers: Headers) {
  const output: Record<string, string> = {};
  headers.forEach((value, key) => {
    output[key] = value;
  });
  return output;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) {
      return NextResponse.json({ success: false, error: "Gecersiz saglayici." }, { status: 404 });
    }

    const text = await request.text();
    let payload: Record<string, unknown> = {};
    if (text) {
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        payload = { raw: text };
      }
    }

    const headers = collectHeaders(request.headers);
    await recordAccountingWebhook(provider, payload, headers);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Accounting webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Webhook islenemedi.",
      },
      { status: 500 },
    );
  }
}

