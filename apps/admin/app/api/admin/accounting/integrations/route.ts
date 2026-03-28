import { NextResponse } from "next/server";
import { listAccountingIntegrations } from "@/lib/db/accounting";

export async function GET() {
  try {
    const integrations = await listAccountingIntegrations();
    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Accounting integrations list error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Muhasebe entegrasyonlari alinamadi.",
      },
      { status: 500 },
    );
  }
}

