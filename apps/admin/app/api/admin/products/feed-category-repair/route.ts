import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { fetchAndParseXmlProductFeed } from "@/lib/admin/product-feed-fetch";
import { createServerClient } from "@/lib/supabase";
import {
  deriveCategoryHierarchyFromProduct,
  ensureProductCategoryHierarchy,
} from "@/lib/category-records";
import { withCelebixCategoryHierarchyMetadata } from "@celebix/platform-config";

export const runtime = "nodejs";

type ExistingProductRecord = {
  id: string;
  slug: string;
  name: string | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  shopify_metadata: Record<string, unknown> | null;
  shopify_metafields: Record<string, unknown> | null;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function toJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: NextRequest) {
  const authResult = await requireAdminApiAuth();
  if (authResult.response) {
    return authResult.response;
  }

  try {
    const body = (await request.json().catch(() => null)) as
      | {
          url?: string;
        }
      | null;

    const feedUrl = body?.url?.trim();
    if (!feedUrl) {
      return NextResponse.json(
        { success: false, error: "Feed URL zorunludur." },
        { status: 400 },
      );
    }

    const { parseResult } = await fetchAndParseXmlProductFeed(feedUrl);
    if (parseResult.products.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          totalFeedProducts: 0,
          matchedProducts: 0,
          updatedProducts: 0,
          skippedProducts: 0,
          failedProducts: 0,
          errors: [],
        },
      });
    }

    const supabase = createServerClient();
    const feedProductsBySlug = new Map(
      parseResult.products.map((product) => [product.slug, product] as const),
    );
    const slugs = Array.from(feedProductsBySlug.keys());
    const existingProducts = new Map<string, ExistingProductRecord>();

    for (const slugChunk of chunkArray(slugs, 100)) {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, category, subcategory, tags, shopify_metadata, shopify_metafields")
        .in("slug", slugChunk);

      if (error) {
        throw error;
      }

      for (const row of (data || []) as ExistingProductRecord[]) {
        existingProducts.set(row.slug, row);
      }
    }

    const result = {
      totalFeedProducts: parseResult.products.length,
      matchedProducts: 0,
      updatedProducts: 0,
      skippedProducts: 0,
      failedProducts: 0,
      errors: [] as string[],
    };

    for (const product of parseResult.products) {
      const existingProduct = existingProducts.get(product.slug);
      if (!existingProduct) {
        result.skippedProducts += 1;
        continue;
      }

      result.matchedProducts += 1;

      try {
        const mergedShopifyMetadata = withCelebixCategoryHierarchyMetadata(
          existingProduct.shopify_metadata,
          {
            category: product.category,
            subcategory: product.subcategory || null,
            categoryPath: product.categoryPath,
            name: existingProduct.name || product.name,
            slug: existingProduct.slug,
            tags: existingProduct.tags || product.tags,
          },
        );

        await ensureProductCategoryHierarchy(supabase, {
          ...deriveCategoryHierarchyFromProduct({
            category: product.category,
            subcategory: product.subcategory || null,
            shopifyMetadata: mergedShopifyMetadata,
            shopifyMetafields: toJsonObject(existingProduct.shopify_metafields),
          }),
          categoryImageUrl: null,
          subcategoryImageUrl: null,
        });

        const { error } = await supabase
          .from("products")
          .update({
            category: product.category,
            subcategory: product.subcategory || null,
            shopify_metadata: mergedShopifyMetadata,
          })
          .eq("id", existingProduct.id);

        if (error) {
          throw error;
        }

        result.updatedProducts += 1;
      } catch (error) {
        result.failedProducts += 1;
        result.errors.push(
          `${product.slug}: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      result,
      warnings: parseResult.warnings,
    });
  } catch (error) {
    console.error("Admin feed category repair route error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Feed kategori onarımı tamamlanamadı.",
      },
      { status: 500 },
    );
  }
}
