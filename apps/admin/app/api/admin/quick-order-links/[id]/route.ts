import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { getQuickOrderLinkById } from "@/lib/db/quick-order-links";
import {
  getOptionalAdminModuleState,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  try {
    const { id } = await params;
    const link = await getQuickOrderLinkById(id);
    return NextResponse.json({ success: true, link });
  } catch (error) {
    console.error("Quick order link detail failed:", error);
    if (isOptionalAdminModuleUnavailable("quick_order_links", error)) {
      return NextResponse.json({
        success: true,
        link: null,
        ...getOptionalAdminModuleState("quick_order_links"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hizli siparis linki yuklenemedi.",
      },
      { status: 500 },
    );
  }
}
