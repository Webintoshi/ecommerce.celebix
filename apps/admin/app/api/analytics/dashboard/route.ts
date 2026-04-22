import { NextRequest, NextResponse } from "next/server";
import { getDashboardAnalyticsPayload } from "@/lib/dashboard-analytics";
import type { TimeRange } from "@/types/analytics";

function toTimeRange(value: string | null): TimeRange {
  if (value === "today" || value === "week" || value === "month" || value === "quarter" || value === "year") {
    return value;
  }

  return "week";
}

export async function GET(request: NextRequest) {
  try {
    const timeRange = toTimeRange(request.nextUrl.searchParams.get("timeRange"));
    const payload = await getDashboardAnalyticsPayload(timeRange);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Analiz verileri alınamadı.",
      },
      { status: 500 },
    );
  }
}
