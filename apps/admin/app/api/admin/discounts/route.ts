import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { createCoupon, getAllCoupons } from "@/lib/db/coupons";
import {
  CouponMetadata,
  getCouponMetadataMap,
  mergeCouponWithMetadata,
  saveCouponMetadataMap,
} from "./_shared";

const metadataSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().default(""),
  scope: z.enum(["all", "products", "collections", "customers"]).optional().default("all"),
  visibility: z.enum(["public", "private", "password"]).optional().default("public"),
  password: z.string().optional().default(""),
  limitType: z.enum(["once", "once_per_customer", "unlimited"]).optional().default("unlimited"),
  tags: z.array(z.string().trim().max(40)).optional().default([]),
  notes: z.string().trim().max(2000).optional().default(""),
});

const createDiscountSchema = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  minOrder: z.number().min(0).optional().default(0),
  maxUses: z.number().int().positive().nullable().optional().default(null),
  startsAt: z.string().datetime().nullable().optional().default(null),
  expiresAt: z.string().datetime().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  metadata: metadataSchema,
});

type CouponRow = Awaited<ReturnType<typeof getAllCoupons>>[number];

function normalizeCode(code: string) {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function toMetadata(input: z.infer<typeof metadataSchema>): CouponMetadata {
  return {
    name: input.name,
    description: input.description,
    scope: input.scope,
    visibility: input.visibility,
    password: input.visibility === "password" ? input.password : "",
    limitType: input.limitType,
    tags: input.tags,
    notes: input.notes,
  };
}

export async function GET() {
  try {
    const serverClient = createServerClient();
    const [coupons, metadataMap] = await Promise.all([
      getAllCoupons(),
      getCouponMetadataMap(serverClient),
    ]);

    const discounts = (coupons as CouponRow[]).map((coupon) =>
      mergeCouponWithMetadata(coupon, metadataMap[coupon.id])
    );

    return NextResponse.json({ success: true, discounts });
  } catch (error) {
    console.error("Error fetching discounts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İndirimler alınamadı.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createDiscountSchema.safeParse(body?.discount);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Geçersiz indirim verisi." },
        { status: 422 }
      );
    }

    const normalizedCode = normalizeCode(parsed.data.code);
    if (!normalizedCode) {
      return NextResponse.json(
        { success: false, error: "Geçerli bir indirim kodu girin." },
        { status: 422 }
      );
    }

    if (parsed.data.type === "percentage" && parsed.data.value > 100) {
      return NextResponse.json(
        { success: false, error: "Yüzde indirim 100’den büyük olamaz." },
        { status: 422 }
      );
    }

    if (parsed.data.startsAt && parsed.data.expiresAt) {
      if (new Date(parsed.data.startsAt) >= new Date(parsed.data.expiresAt)) {
        return NextResponse.json(
          { success: false, error: "Bitiş tarihi başlangıç tarihinden sonra olmalı." },
          { status: 422 }
        );
      }
    }

    const created = await createCoupon({
      code: normalizedCode,
      type: parsed.data.type,
      value: parsed.data.value,
      minOrder: parsed.data.minOrder,
      maxUses: parsed.data.maxUses || undefined,
      startsAt: parsed.data.startsAt || undefined,
      expiresAt: parsed.data.expiresAt || undefined,
    });

    const serverClient = createServerClient();
    if (!parsed.data.isActive) {
      await serverClient.from("coupons").update({ is_active: false }).eq("id", created.id);
      created.is_active = false;
    }

    const metadataMap = await getCouponMetadataMap(serverClient);
    metadataMap[created.id] = toMetadata(parsed.data.metadata);
    await saveCouponMetadataMap(serverClient, metadataMap);

    const discount = mergeCouponWithMetadata(created as CouponRow, metadataMap[created.id]);
    return NextResponse.json({ success: true, discount });
  } catch (error) {
    console.error("Error creating discount:", error);
    const message = error instanceof Error ? error.message : "İndirim oluşturulamadı.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)) : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Silinecek indirim listesi boş." },
        { status: 400 }
      );
    }

    const serverClient = createServerClient();
    const { error } = await serverClient.from("coupons").delete().in("id", ids);
    if (error) throw error;

    const metadataMap = await getCouponMetadataMap(serverClient);
    for (const id of ids) {
      delete metadataMap[id];
    }
    await saveCouponMetadataMap(serverClient, metadataMap);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting discounts:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İndirimler silinemedi.",
      },
      { status: 500 }
    );
  }
}

