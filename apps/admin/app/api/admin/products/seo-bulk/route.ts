import { NextRequest, NextResponse } from "next/server";
import {
  generateProductSeoSuggestion,
  isMissingCriticalProductSeo,
  isWeakProductSeo,
} from "@/lib/product-seo-generator";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";

type BulkSeoMode = "all" | "weak" | "missing";

function normalizeMode(value: unknown): BulkSeoMode {
  if (value === "all" || value === "weak" || value === "missing") {
    return value;
  }

  return "weak";
}

function shouldIncludeProduct(
  product: Record<string, unknown>,
  mode: BulkSeoMode,
  activeOnly: boolean,
) {
  const isActive = product.is_active !== false;

  if (activeOnly && !isActive) {
    return false;
  }

  if (mode === "missing") {
    return isMissingCriticalProductSeo(product);
  }

  if (mode === "weak") {
    return isWeakProductSeo(product);
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = normalizeMode(body?.mode);
    const activeOnly = body?.activeOnly !== false;
    const supabase = createServerClient();

    const { data: products, error } = await supabase
      .from("products")
      .select(
        "id,slug,name,description,short_description,tags,category,subcategory,images,is_active,status,seo_title,seo_description,seo_keywords,seo_focus_keyword,canonical_url,seo_robots,og_image,faq",
      )
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    const candidates = (products || []).filter((product) =>
      shouldIncludeProduct(product, mode, activeOnly),
    );

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        mode,
        activeOnly,
        updated: 0,
        skipped: (products || []).length,
      });
    }

    const updatedAt = new Date().toISOString();

    await Promise.all(
      candidates.map(async (product) => {
        const suggestion = generateProductSeoSuggestion(product);
        const payload = {
          seo_title: suggestion.title,
          seo_description: suggestion.description,
          seo_keywords: suggestion.keywords,
          seo_focus_keyword: suggestion.focusKeyword,
          canonical_url: suggestion.canonicalUrl,
          seo_robots: suggestion.robots,
          og_image: suggestion.ogImage,
          updated_at: updatedAt,
        };

        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", product.id);

        if (updateError) {
          throw updateError;
        }
      }),
    );

    return NextResponse.json({
      success: true,
      mode,
      activeOnly,
      updated: candidates.length,
      skipped: Math.max(0, (products || []).length - candidates.length),
      productIds: candidates.map((product) => product.id),
    });
  } catch (error) {
    console.error("Bulk product SEO generation failed:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Toplu urun SEO guncellemesi tamamlanamadi.",
      },
      { status: 500 },
    );
  }
}
