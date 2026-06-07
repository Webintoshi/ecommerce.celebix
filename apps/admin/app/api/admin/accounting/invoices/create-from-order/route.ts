import { NextRequest, NextResponse } from "next/server";
import { createInvoiceFromOrder } from "@/lib/db/accounting";
import { isAccountingProvider } from "@/lib/accounting-providers";
import type { AccountingProvider } from "@/types/accounting";
import {
  getOptionalAdminModuleFailurePayload,
  isOptionalAdminModuleUnavailable,
} from "@/lib/optional-admin-modules";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      orderId?: string;
      provider?: string;
    };

    if (!body?.orderId) {
      return NextResponse.json(
        { success: false, error: "orderId zorunludur." },
        { status: 422 },
      );
    }

    const provider =
      body.provider && isAccountingProvider(body.provider)
        ? (body.provider as AccountingProvider)
        : undefined;

    const result = await createInvoiceFromOrder(body.orderId, provider);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Create invoice from order error:", error);
    if (isOptionalAdminModuleUnavailable("accounting", error)) {
      return NextResponse.json(
        getOptionalAdminModuleFailurePayload("accounting"),
        { status: 501 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Fatura adayı oluşturulamadı.",
      },
      { status: 500 },
    );
  }
}
