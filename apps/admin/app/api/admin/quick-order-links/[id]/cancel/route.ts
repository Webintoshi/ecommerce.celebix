import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { cancelQuickOrderLink } from "@/lib/db/quick-order-links";
import {
  DERYCRAFT_REQUIRES_LIGHT_POSTGRES_SUPPORT_CODE,
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminQuickOrderDisabled,
} from "@/lib/light-postgres-readiness";

export const runtime = "nodejs";

function buildDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      code: DERYCRAFT_TEMPORARILY_DISABLED_CODE,
      reason: DERYCRAFT_REQUIRES_LIGHT_POSTGRES_SUPPORT_CODE,
      error: "Hizli siparis linkleri DeryCraft light_postgres provasinda gecici olarak pasif.",
    },
    { status: 503 },
  );
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  if (isAdminQuickOrderDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { id } = await params;
    const link = await cancelQuickOrderLink(id);
    return NextResponse.json({ success: true, link });
  } catch (error) {
    console.error("Quick order link cancel failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hizli siparis linki iptal edilemedi.",
      },
      { status: 500 },
    );
  }
}
