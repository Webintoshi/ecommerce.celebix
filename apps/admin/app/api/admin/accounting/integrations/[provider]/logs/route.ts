import { NextRequest, NextResponse } from "next/server";
import { isAccountingProvider } from "@/lib/accounting-providers";
import { getProviderSyncLogs } from "@/lib/db/accounting";
import {
  getOptionalAdminModuleState,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) {
      return NextResponse.json({ success: false, error: "Gecersiz saglayici." }, { status: 404 });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") || "30");
    const logs = await getProviderSyncLogs(provider, Number.isFinite(limit) ? limit : 30);
    return NextResponse.json({ success: true, logs });
  } catch (error) {
    console.error("Accounting sync logs error:", error);
    if (isOptionalAdminModuleUnavailable("accounting", error)) {
      return NextResponse.json({
        success: true,
        logs: [],
        ...getOptionalAdminModuleState("accounting"),
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hata gunlugu alinamadi.",
      },
      { status: 500 },
    );
  }
}
