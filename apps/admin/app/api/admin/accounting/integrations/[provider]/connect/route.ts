import { NextRequest, NextResponse } from "next/server";
import { isAccountingProvider } from "@/lib/accounting-providers";
import { saveAccountingConnection } from "@/lib/db/accounting";
import {
  getOptionalAdminModuleFailurePayload,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) {
      return NextResponse.json({ success: false, error: "Gecersiz saglayici." }, { status: 404 });
    }

    const body = (await request.json()) as {
      credentials?: Record<string, string>;
      syncMode?: "safe_hybrid";
      fieldMappings?: Record<string, string>;
      settings?: Record<string, unknown>;
    };

    const result = await saveAccountingConnection(provider, {
      credentials: body.credentials || {},
      syncMode: body.syncMode || "safe_hybrid",
      fieldMappings: body.fieldMappings || {},
      settings: body.settings || {},
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Accounting connect error:", error);
    if (isOptionalAdminModuleUnavailable("accounting", error)) {
      return NextResponse.json(
        getOptionalAdminModuleFailurePayload("accounting"),
        { status: 501 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Baglanti kaydedilemedi.",
      },
      { status: 500 },
    );
  }
}
