import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { duplicateQuickOrderLink } from "@/lib/db/quick-order-links";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  try {
    const { id } = await params;
    const link = await duplicateQuickOrderLink(id);
    return NextResponse.json({ success: true, link }, { status: 201 });
  } catch (error) {
    console.error("Quick order link duplicate failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hizli siparis linki kopyalanamadi.",
      },
      { status: 500 },
    );
  }
}
