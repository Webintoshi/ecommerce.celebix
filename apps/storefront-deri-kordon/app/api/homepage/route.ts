import { NextRequest, NextResponse } from "next/server";
import { getHomepageData } from "@/lib/homepage";

export async function GET(request: NextRequest) {
    try {
        const homepageData = await getHomepageData();

        return NextResponse.json({
            ...homepageData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Homepage data API error:", error);
        return NextResponse.json(
            { error: "Failed to fetch homepage data" },
            { status: 500 }
        );
    }
}
