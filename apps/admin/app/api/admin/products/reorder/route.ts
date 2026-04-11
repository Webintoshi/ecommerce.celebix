import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase";
import {
  getProductListingOrderPositions,
  setProductListingOrderPositions,
} from "@/lib/db/settings";
import {
  buildSequentialProductListingPositions,
  sortProductsByListingOrder,
} from "@celebix/platform-config/src/product-listing-order";

export const runtime = "nodejs";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().uuid()).min(2),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Geçersiz ürün sıralama verisi." },
        { status: 422 },
      );
    }

    const uniqueOrderedIds = Array.from(new Set(parsed.data.orderedIds));
    const supabase = createServerClient();

    const [{ data: products, error }, existingPositions] = await Promise.all([
      supabase.from("products").select("id, created_at, name").order("created_at", { ascending: false }),
      getProductListingOrderPositions(),
    ]);

    if (error) {
      throw error;
    }

    const currentOrderedIds = sortProductsByListingOrder(
      ((products || []) as Array<{ id: string; created_at?: string | null; name?: string | null }>),
      existingPositions,
    ).map((product) => product.id);

    const availableIds = new Set(currentOrderedIds);
    const sanitizedOrderedIds = uniqueOrderedIds.filter((productId) => availableIds.has(productId));

    if (sanitizedOrderedIds.length < 2) {
      return NextResponse.json(
        { success: false, error: "Sıralanacak geçerli ürün bulunamadı." },
        { status: 400 },
      );
    }

    const reorderedSet = new Set(sanitizedOrderedIds);
    const reorderedIndexes = currentOrderedIds
      .map((productId, index) => (reorderedSet.has(productId) ? index : -1))
      .filter((index) => index >= 0);

    const nextFullOrder = [...currentOrderedIds];
    reorderedIndexes.forEach((index, position) => {
      nextFullOrder[index] = sanitizedOrderedIds[position];
    });

    const nextPositions = buildSequentialProductListingPositions(nextFullOrder);
    await setProductListingOrderPositions(nextPositions);

    return NextResponse.json({
      success: true,
      orderedIds: nextFullOrder,
      positions: sanitizedOrderedIds.map((productId) => ({
        productId,
        sortOrder: nextPositions[productId],
      })),
    });
  } catch (error) {
    console.error("Product reorder failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Ürün sıralaması güncellenemedi." },
      { status: 500 },
    );
  }
}
