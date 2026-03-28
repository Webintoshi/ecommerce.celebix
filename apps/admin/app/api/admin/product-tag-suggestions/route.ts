import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { normalizeProductTag } from "@/lib/product-tags";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const requestedLimit = Number(searchParams.get("limit") || DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const supabase = createServerClient();
    let query = supabase
      .from("product_tag_suggestions")
      .select("value,usage_count")
      .order("usage_count", { ascending: false })
      .order("last_used_at", { ascending: false })
      .order("value", { ascending: true })
      .limit(limit);

    const normalizedQuery = normalizeProductTag(q);
    if (normalizedQuery) {
      query = query.ilike("value", `%${normalizedQuery}%`);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      tags: (data || []).map((row) => ({
        value: row.value,
        usageCount: row.usage_count,
      })),
    });
  } catch (error) {
    console.error("Error fetching product tag suggestions:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Etiket önerileri alınamadı.",
      },
      { status: 500 }
    );
  }
}
