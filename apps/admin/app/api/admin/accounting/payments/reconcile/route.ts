import { NextRequest, NextResponse } from "next/server";
import { reconcileAccountingPayments } from "@/lib/db/accounting";
import { isAccountingProvider } from "@/lib/accounting-providers";
import type { AccountingProvider } from "@/types/accounting";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { provider?: string };
    const provider =
      body.provider && isAccountingProvider(body.provider)
        ? (body.provider as AccountingProvider)
        : undefined;

    const result = await reconcileAccountingPayments(provider);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Accounting payment reconcile error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Tahsilat uzlastirma basarisiz.",
      },
      { status: 500 },
    );
  }
}

