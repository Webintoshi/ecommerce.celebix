import { NextRequest, NextResponse } from "next/server";
import { getStoredPaymentGateways } from "@/lib/db/payment-gateways";
import { getQuickOrderLinkByToken, markQuickOrderLinkOpened } from "@/lib/db/quick-order-links";
import { getPaymentGatewayRuntimeStatus, sanitizePublicPaymentGateway } from "@/lib/payment-providers";

function isManualGateway(gateway: { gateway: string }) {
  return gateway.gateway === "bank_transfer" || gateway.gateway === "cod";
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    let link = await getQuickOrderLinkByToken(token);

    if (link.status === "active") {
      link = await markQuickOrderLinkOpened(link.id);
    }

    const gateways = link.status === "paid" || link.status === "cancelled" || link.status === "expired"
      ? []
      : (await getStoredPaymentGateways())
          .filter((gateway) =>
            gateway.status === "active"
            && !isManualGateway(gateway)
            && getPaymentGatewayRuntimeStatus(gateway).isReady
            && link.allowed_payment_method_ids.includes(gateway.id),
          )
          .map((gateway) => sanitizePublicPaymentGateway(gateway));

    return NextResponse.json({
      success: true,
      link,
      gateways,
    });
  } catch (error) {
    console.error("Quick order link read failed:", error);
    const status =
      error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "PGRST116"
        ? 404
        : 500;
    return NextResponse.json(
      {
        success: false,
        error:
          status === 404
            ? "Hizli siparis linki bulunamadi."
            : error instanceof Error
              ? error.message
              : "Hizli siparis linki yuklenemedi.",
      },
      { status },
    );
  }
}
