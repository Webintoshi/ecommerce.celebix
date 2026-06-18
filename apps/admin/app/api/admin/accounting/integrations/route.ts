import { NextResponse } from "next/server";
import { listAccountingIntegrations } from "@/lib/db/accounting";
import { ACCOUNTING_PROVIDER_DEFINITIONS } from "@/lib/accounting-providers";
import { buildOptionalModuleDisabledPayload, isMissingDatabaseObjectError } from "@/lib/db/light-postgres-compat";

export async function GET() {
  try {
    const integrations = await listAccountingIntegrations();
    return NextResponse.json({ success: true, integrations });
  } catch (error) {
    console.error("Accounting integrations list error:", error);
    if (isMissingDatabaseObjectError(error)) {
      return NextResponse.json({
        success: true,
        integrations: ACCOUNTING_PROVIDER_DEFINITIONS.map((provider) => ({
          provider,
          connection: null,
          queueStats: { queued: 0, failed: 0, manualActionRequired: 0 },
        })),
        ...buildOptionalModuleDisabledPayload("accounting"),
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
