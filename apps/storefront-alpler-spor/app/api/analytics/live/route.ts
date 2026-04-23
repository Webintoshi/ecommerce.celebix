import { NextResponse } from "next/server";
import { getLiveAnalyticsSnapshot } from "@/lib/live-analytics";

export async function GET() {
    try {
        const payload = await getLiveAnalyticsSnapshot();
        return NextResponse.json(payload);
    } catch (error) {
        console.error("Live analytics error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch live data" },
            { status: 500 }
        );
    }
}
