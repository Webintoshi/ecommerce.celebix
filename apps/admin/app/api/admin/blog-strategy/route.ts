import { NextResponse } from "next/server";
import { getAdminAuthContext } from "@/lib/admin-auth";
import { getBlogStrategySnapshot } from "@/lib/blog-strategy";
import type { BlogStrategyApiResponse } from "@/types/blog-strategy";

export async function GET() {
  try {
    const auth = await getAdminAuthContext();

    if (!auth) {
      return NextResponse.json<BlogStrategyApiResponse>(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const snapshot = await getBlogStrategySnapshot();

    return NextResponse.json<BlogStrategyApiResponse>({
      success: true,
      snapshot,
    });
  } catch (error) {
    console.error("Blog strategy snapshot error:", error);
    return NextResponse.json<BlogStrategyApiResponse>(
      {
        success: false,
        error: error instanceof Error ? error.message : "Blog strategy load failed",
      },
      { status: 500 },
    );
  }
}
