import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getActivePaymentGatewayById } from "@/lib/db/payment-gateways";
import { getQuickOrderLinkByToken, markQuickOrderLinkOpened, validateQuickOrderStock } from "@/lib/db/quick-order-links";
import { initializePayment } from "@/lib/payment-runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  paymentMethod: z.string().trim().min(1),
});

function getBaseUrl(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return new URL(request.url).origin;
}

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "127.0.0.1";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "127.0.0.1";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Odeme yontemi secilmelidir.",
        },
        { status: 422 },
      );
    }

    let link = await getQuickOrderLinkByToken(token);

    if (link.status === "paid") {
      return NextResponse.json(
        {
          success: false,
          error: "Bu hizli siparis linki zaten odendi.",
          link,
        },
        { status: 409 },
      );
    }

    if (link.status === "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: "Bu hizli siparis linki iptal edildi.",
        },
        { status: 409 },
      );
    }

    if (link.status === "expired") {
      return NextResponse.json(
        {
          success: false,
          error: "Bu hizli siparis linkinin suresi doldu.",
        },
        { status: 409 },
      );
    }

    const gateway = await getActivePaymentGatewayById(parsed.data.paymentMethod);
    if (!gateway || gateway.gateway === "bank_transfer" || gateway.gateway === "cod") {
      return NextResponse.json(
        {
          success: false,
          error: "Secilen odeme yontemi bu link icin uygun degil.",
        },
        { status: 404 },
      );
    }

    if (link.allowed_payment_method_ids.length > 0 && !link.allowed_payment_method_ids.includes(gateway.id)) {
      return NextResponse.json(
        {
          success: false,
          error: "Bu odeme yontemi bu hizli siparis linkinde kullanilamaz.",
        },
        { status: 403 },
      );
    }

    if (link.status === "active") {
      link = await markQuickOrderLinkOpened(link.id);
    }

    await validateQuickOrderStock(link);

    const payment = await initializePayment({
      gateway,
      order: {
        id: link.id,
        order_number: `QO-${link.id.slice(0, 8).toUpperCase()}`,
        total: Number(link.total),
        currency: link.currency,
      },
      quickOrderLink: {
        id: link.id,
        token: link.token,
      },
      items: link.items.map((item) => ({
        productId: item.product_id || item.id,
        productName: item.product_name,
        quantity: item.quantity,
        price: item.unit_price,
        total: item.line_total,
      })),
      customerEmail: link.customer_email,
      customerIp: getRequestIp(request),
      shippingAddress: link.shipping_address,
      billingAddress: link.billing_address,
      siteUrl: getBaseUrl(request),
    });

    return NextResponse.json({
      success: true,
      link,
      payment,
    });
  } catch (error) {
    console.error("Quick order checkout init failed:", error);
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
              : "Hizli siparis odemesi baslatilamadi.",
      },
      { status },
    );
  }
}
