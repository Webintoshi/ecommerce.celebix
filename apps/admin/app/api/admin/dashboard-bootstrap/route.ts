import { NextResponse } from "next/server";
import { getAdminDashboardBootstrapData } from "@/lib/admin-dashboard";

export async function GET() {
  try {
    const data = await getAdminDashboardBootstrapData();
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
