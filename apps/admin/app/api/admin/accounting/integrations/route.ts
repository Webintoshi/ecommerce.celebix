import { NextResponse } from "next/server";
import { listAccountingIntegrations } from "@/lib/db/accounting";
import {
  getOptionalAdminModuleState,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

export async function GET() {
  try {
    const integrations = await listAccountingIntegrations();
    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Accounting integrations list error:", error);
    if (isOptionalAdminModuleUnavailable("accounting", error)) {
      return NextResponse.json({
        success: true,
        integrations: [],
        ...getOptionalAdminModuleState("accounting"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Muhasebe entegrasyonlari alinamadi.",
      },
      { status: 500 },
    );
  }
}
