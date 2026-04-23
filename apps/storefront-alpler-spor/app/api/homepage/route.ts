import { NextResponse } from "next/server";
import { getHomepageData } from "@/lib/homepage";
import { getRequestLocale } from "@/lib/request-locale";

export async function GET() {
  try {
    const locale = await getRequestLocale();
    const homepageData = await getHomepageData(locale);

    return NextResponse.json({
      ...homepageData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Homepage data API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch homepage data" },
      { status: 500 },
    );
  }
}
