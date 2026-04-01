import { NextRequest, NextResponse } from "next/server";
import { enqueueInventorySyncByVariantIds } from "@/lib/db/marketplace-sync";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

function normalizeProductIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function normalizeStockValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  const normalized = Math.max(0, Math.floor(parsed));
  return normalized;
}

function logInventoryQueueError(error: unknown) {
  console.error("Bulk stock inventory sync enqueue failed:", error);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const productIds = normalizeProductIds(body?.productIds);
    const stock = normalizeStockValue(body?.stock);

    if (productIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "En az bir urun secilmelidir." },
        { status: 400 }
      );
    }

    if (stock === null) {
      return NextResponse.json(
        { success: false, error: "Gecerli bir stok degeri girilmelidir." },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const { data: variants, error: variantsError } = await supabase
      .from("product_variants")
      .select("id,product_id")
      .in("product_id", productIds);

    if (variantsError) {
      throw variantsError;
    }

    const variantIds = (variants || []).map((variant) => variant.id);
    const touchedProductIds = [...new Set((variants || []).map((variant) => variant.product_id))];

    if (variantIds.length === 0) {
      return NextResponse.json({
        success: true,
        updatedProducts: 0,
        updatedVariants: 0,
        stock,
      });
    }

    const { error: updateError } = await supabase
      .from("product_variants")
      .update({ stock })
      .in("id", variantIds);

    if (updateError) {
      throw updateError;
    }

    const { error: touchError } = await supabase
      .from("products")
      .update({ updated_at: new Date().toISOString() })
      .in("id", touchedProductIds);

    if (touchError) {
      throw touchError;
    }

    try {
      await enqueueInventorySyncByVariantIds(variantIds);
    } catch (queueError) {
      logInventoryQueueError(queueError);
    }

    return NextResponse.json({
      success: true,
      updatedProducts: touchedProductIds.length,
      updatedVariants: variantIds.length,
      stock,
    });
  } catch (error) {
    console.error("Error bulk updating product stock:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Toplu stok guncellenemedi.",
      },
      { status: 500 }
    );
  }
}
