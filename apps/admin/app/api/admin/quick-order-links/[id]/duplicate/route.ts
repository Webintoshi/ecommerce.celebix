import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { duplicateQuickOrderLink } from "@/lib/db/quick-order-links";
import {
  getOptionalAdminModuleFailurePayload,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

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
    if (isOptionalAdminModuleUnavailable("quick_order_links", error)) {
      return NextResponse.json(
        getOptionalAdminModuleFailurePayload("quick_order_links"),
        { status: 501 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hizli siparis linki kopyalanamadi.",
      },
      { status: 500 },
    );
  }
}
