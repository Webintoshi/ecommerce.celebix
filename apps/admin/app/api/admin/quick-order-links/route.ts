import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { createQuickOrderLink, listQuickOrderLinks } from "@/lib/db/quick-order-links";
import {
  DERYCRAFT_REQUIRES_LIGHT_POSTGRES_SUPPORT_CODE,
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminQuickOrderDisabled,
} from "@/lib/light-postgres-readiness";

export const runtime = "nodejs";

const addressSchema = z.object({
  firstName: z.string().trim().min(1, "Ad zorunludur."),
  lastName: z.string().trim().min(1, "Soyad zorunludur."),
  phone: z.string().trim().min(1, "Telefon zorunludur."),
  address: z.string().trim().min(1, "Adres zorunludur."),
  city: z.string().trim().min(1, "Sehir zorunludur."),
  district: z.string().trim().optional().default(""),
  postalCode: z.string().trim().optional().default(""),
  country: z.string().trim().optional().default("Türkiye"),
});

const itemSchema = z.object({
  productId: z.string().uuid("Gecerli bir ürün secilmelidir."),
  variantId: z.string().uuid("Gecerli bir varyant secilmelidir."),
  productName: z.string().trim().min(1, "Ürün adı zorunludur."),
  variantName: z.string().trim().optional().nullable(),
  quantity: z.coerce.number().int().min(1, "Adet en az 1 olmalidir."),
  unitPrice: z.coerce.number().min(0, "Birim fiyat negatif olamaz."),
  lineTotal: z.coerce.number().min(0).optional(),
  image: z.string().trim().optional().nullable(),
  sku: z.string().trim().optional().nullable(),
});

const requestSchema = z.object({
  customerEmail: z.string().trim().email("Gecerli bir e-posta adresi girin."),
  customerName: z.string().trim().optional().nullable(),
  customerPhone: z.string().trim().optional().nullable(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema,
  currency: z.string().trim().min(3).max(8).default("TRY"),
  shippingCost: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  note: z.string().trim().optional().nullable(),
  allowedPaymentMethodIds: z.array(z.string().trim().min(1)).default([]),
  expiresAt: z.string().datetime("Gecerli bir son kullanma tarihi gerekir."),
  items: z.array(itemSchema).min(1, "En az bir ürün secin."),
});

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

export async function GET() {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  if (isAdminQuickOrderDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const links = await listQuickOrderLinks();
    return NextResponse.json({ success: true, links });
  } catch (error) {
    console.error("Quick order links list failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hizli siparis linkleri yuklenemedi.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  if (isAdminQuickOrderDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Gecersiz hizli siparis istegi.",
          details: parsed.error.flatten(),
        },
        { status: 422 },
      );
    }

    const link = await createQuickOrderLink(parsed.data);
    return NextResponse.json({ success: true, link }, { status: 201 });
  } catch (error) {
    console.error("Quick order link create failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Hizli siparis linki olusturulamadi.",
      },
      { status: 500 },
    );
  }
}
