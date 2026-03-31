import { NextResponse } from "next/server";
import { getHomepageData } from "@/lib/homepage";

export async function GET() {
  try {
    const homepageData = await getHomepageData();
    return NextResponse.json(homepageData);
  } catch (error) {
    console.error("Homepage data API error:", error);
    return NextResponse.json({ error: "Failed to fetch homepage data" }, { status: 500 });
  }
}
