import { requireLegacyAdminApi } from "@/lib/legacy-admin-api-auth";
import { NextRequest, NextResponse } from "next/server";
import { getLiveAnalyticsSnapshot } from "@/lib/live-analytics";

export async function GET(request: NextRequest) {
    const denied = await requireLegacyAdminApi(request, "admin");
    if (denied) return denied;

    try {
        const data = await getLiveAnalyticsSnapshot();
        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error("Live analytics error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch live data" },
            { status: 500 }
        );
    }
}
