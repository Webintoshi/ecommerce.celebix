import { NextResponse } from "next/server";
import { getAccountingOverview } from "@/lib/db/accounting";
import { buildOptionalModuleDisabledPayload, isMissingDatabaseObjectError } from "@/lib/db/light-postgres-compat";

export async function GET() {
  try {
    const overview = await getAccountingOverview();
    return NextResponse.json({ success: true, overview });
  } catch (error) {
    console.error("Accounting overview error:", error);
    if (isMissingDatabaseObjectError(error)) {
      return NextResponse.json({
        success: true,
        overview: {
          today: { invoiceCount: 0, syncedCount: 0, queuedCount: 0, invoicedAmount: 0 },
          openReceivables: { orderCount: 0, amount: 0, orders: [] },
          vatSummary: { rate: 20, taxBase: 0, taxAmount: 0, grossAmount: 0 },
          syncStatus: { activeConnections: 0, pendingQueue: 0, failedQueue: 0, lastSyncAt: null },
        },
        ...buildOptionalModuleDisabledPayload("accounting"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Muhasebe ozet verisi alinamadi.",
      },
      { status: 500 },
    );
  }
}
