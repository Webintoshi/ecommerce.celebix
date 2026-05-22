import { NextRequest, NextResponse } from "next/server";
import { getAdminDashboardBootstrapData } from "@/lib/admin-dashboard";
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
    const data = await getAdminDashboardBootstrapData({ timeRange });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Admin dashboard bootstrap error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Dashboard verileri alinamadi.",
      },
      { status: 500 }
    );
  }
}
