import { NextResponse } from "next/server";
import { getAccountingOverview } from "@/lib/db/accounting";

export async function GET() {
  try {
    const overview = await getAccountingOverview();
    return NextResponse.json({ success: true, overview });
  } catch (error) {
    console.error("Accounting overview error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Muhasebe ozet verisi alinamadi.",
      },
      { status: 500 },
    );
  }
}

