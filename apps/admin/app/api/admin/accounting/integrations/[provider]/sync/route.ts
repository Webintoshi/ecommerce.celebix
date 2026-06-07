import { NextResponse } from "next/server";
import { isAccountingProvider } from "@/lib/accounting-providers";
import { runAccountingSync } from "@/lib/db/accounting";
import { isRedisLockError } from "@/lib/redis";
import {
  getOptionalAdminModuleFailurePayload,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

interface Params {
  params: Promise<{ provider: string }>;
}

export async function POST(_: Request, { params }: Params) {
  try {
    const { provider } = await params;
    if (!isAccountingProvider(provider)) {
      return NextResponse.json({ success: false, error: "Gecersiz saglayici." }, { status: 404 });
    }

    const summary = await runAccountingSync({
      provider,
      failOnLockedProvider: true,
    });
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error("Accounting manual sync error:", error);
    if (isOptionalAdminModuleUnavailable("accounting", error)) {
      return NextResponse.json(
        getOptionalAdminModuleFailurePayload("accounting"),
        { status: 501 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Senkronizasyon basarisiz.",
      },
      { status: isRedisLockError(error) ? 409 : 500 },
    );
  }
}
