import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import { deleteCoupon, getCouponById, updateCoupon } from "@/lib/db/coupons";
import {
  CouponMetadata,
  getCouponMetadataMap,
  mergeCouponWithMetadata,
  saveCouponMetadataMap,
} from "../_shared";

const updateDiscountSchema = z.object({
  code: z.string().trim().min(3).max(40),
  type: z.enum(["percentage", "fixed"]),
  value: z.number().positive(),
  minOrder: z.number().min(0).optional().default(0),
  maxUses: z.number().int().positive().nullable().optional().default(null),
  startsAt: z.string().datetime().nullable().optional().default(null),
  expiresAt: z.string().datetime().nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
  metadata: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional().default(""),
    scope: z.enum(["all", "products", "collections", "customers"]).optional().default("all"),
    visibility: z.enum(["public", "private", "password"]).optional().default("public"),
    password: z.string().optional().default(""),
    limitType: z.enum(["once", "once_per_customer", "unlimited"]).optional().default("unlimited"),
    tags: z.array(z.string().trim().max(40)).optional().default([]),
    notes: z.string().trim().max(2000).optional().default(""),
  }),
});

type CouponRow = NonNullable<Awaited<ReturnType<typeof getCouponById>>>;

function normalizeCode(code: string) {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function toMetadata(input: z.infer<typeof updateDiscountSchema>["metadata"]): CouponMetadata {
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

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    const coupon = (await getCouponById(id)) as CouponRow;

    const serverClient = createServerClient();
    const metadataMap = await getCouponMetadataMap(serverClient);
    const discount = mergeCouponWithMetadata(coupon, metadataMap[id]);

    return NextResponse.json({ success: true, discount });
  } catch (error) {
    console.error("Error fetching discount:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İndirim bulunamadı.",
      },
      { status: 404 }
    );
  }
}

export async function PUT(request: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateDiscountSchema.safeParse(body?.discount);

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

    const updated = await updateCoupon(id, {
      code: normalizedCode,
      type: parsed.data.type,
      value: parsed.data.value,
      min_order: parsed.data.minOrder,
      max_uses: parsed.data.maxUses,
      starts_at: parsed.data.startsAt,
      expires_at: parsed.data.expiresAt,
      is_active: parsed.data.isActive,
    });

    const serverClient = createServerClient();
    const metadataMap = await getCouponMetadataMap(serverClient);
    metadataMap[id] = toMetadata(parsed.data.metadata);
    await saveCouponMetadataMap(serverClient, metadataMap);

    const discount = mergeCouponWithMetadata(updated as CouponRow, metadataMap[id]);
    return NextResponse.json({ success: true, discount });
  } catch (error) {
    console.error("Error updating discount:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İndirim güncellenemedi.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(_: NextRequest, context: RouteParams) {
  try {
    const { id } = await context.params;
    await deleteCoupon(id);

    const serverClient = createServerClient();
    const metadataMap = await getCouponMetadataMap(serverClient);
    delete metadataMap[id];
    await saveCouponMetadataMap(serverClient, metadataMap);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting discount:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "İndirim silinemedi.",
      },
      { status: 500 }
    );
  }
}

