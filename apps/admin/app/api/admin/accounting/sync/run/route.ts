import { NextResponse } from "next/server";
import { runAccountingSync } from "@/lib/db/accounting";
import { isRedisLockError } from "@/lib/redis";

export async function POST() {
  try {
    const summary = await runAccountingSync();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("Accounting scheduled sync error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Zamanlanmis senkronizasyon basarisiz.",
      },
      { status: isRedisLockError(error) ? 409 : 500 },
    );
  }
}
