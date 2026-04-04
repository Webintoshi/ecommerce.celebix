import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PRODUCT_REVIEW_STATUS,
  isProductReviewStatus,
  type ProductReviewStatus,
} from "@celebix/platform-config/src/product-reviews";
import { resolveAdminAssetUrl } from "@/lib/asset-url";

export interface AdminProductReviewRecord {
  id: string;
  product_id: string;
  variant_id: string | null;
  customer_id: string | null;
  reviewer_name: string;
  reviewer_email: string | null;
  rating: number;
  title: string | null;
  body: string;
  image_urls: string[];
  status: ProductReviewStatus;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  product: {
    id: string;
    name: string;
    slug: string;
  } | null;
  variant: {
    id: string;
    name: string;
  } | null;
}

function normalizeImageUrls(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item : ""))
        .filter((item) => item.length > 0)
        .map((item) => resolveAdminAssetUrl(item) || item)
    : [];
}

export function normalizeAdminProductReview(record: Record<string, unknown>): AdminProductReviewRecord {
  return {
    id: String(record.id || ""),
    product_id: String(record.product_id || ""),
    variant_id: typeof record.variant_id === "string" ? record.variant_id : null,
    customer_id: typeof record.customer_id === "string" ? record.customer_id : null,
    reviewer_name: String(record.reviewer_name || ""),
    reviewer_email: typeof record.reviewer_email === "string" ? record.reviewer_email : null,
    rating: Number(record.rating || 0),
    title: typeof record.title === "string" ? record.title : null,
    body: String(record.body || ""),
    image_urls: normalizeImageUrls(record.image_urls),
    status: isProductReviewStatus(record.status) ? record.status : DEFAULT_PRODUCT_REVIEW_STATUS,
    approved_at: typeof record.approved_at === "string" ? record.approved_at : null,
    approved_by: typeof record.approved_by === "string" ? record.approved_by : null,
    created_at: String(record.created_at || ""),
    updated_at: String(record.updated_at || ""),
    product:
      record.product && typeof record.product === "object"
        ? {
            id: String((record.product as Record<string, unknown>).id || ""),
            name: String((record.product as Record<string, unknown>).name || ""),
            slug: String((record.product as Record<string, unknown>).slug || ""),
          }
        : null,
    variant:
      record.variant && typeof record.variant === "object"
        ? {
            id: String((record.variant as Record<string, unknown>).id || ""),
            name: String((record.variant as Record<string, unknown>).name || ""),
          }
        : null,
  };
}

export async function listAdminProductReviews(
  supabase: SupabaseClient,
  options: {
    status?: ProductReviewStatus | "all";
    query?: string;
    limit?: number;
  } = {},
) {
  let query = supabase
    .from("product_reviews")
    .select(
      `
      *,
      product:products(id,name,slug),
      variant:product_variants(id,name)
    `,
    )
    .order("created_at", { ascending: false });

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const normalized = (data || []).map((record) =>
    normalizeAdminProductReview((record ?? {}) as Record<string, unknown>),
  );

  const q = options.query?.trim().toLocaleLowerCase("tr");
  if (!q) {
    return normalized;
  }

  return normalized.filter((review) => {
    return [
      review.reviewer_name,
      review.reviewer_email || "",
      review.title || "",
      review.body,
      review.product?.name || "",
      review.variant?.name || "",
    ].some((field) => field.toLocaleLowerCase("tr").includes(q));
  });
}

export async function recalculateProductReviewMetrics(supabase: SupabaseClient, productId: string) {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("status", "approved");

  if (error) {
    throw error;
  }

  const ratings = (data || [])
    .map((record) => Number(record.rating || 0))
    .filter((rating) => Number.isFinite(rating) && rating > 0);

  const reviewCount = ratings.length;
  const rating =
    reviewCount > 0
      ? Number((ratings.reduce((sum, current) => sum + current, 0) / reviewCount).toFixed(2))
      : 0;

  const { error: updateError } = await supabase
    .from("products")
    .update({
      rating,
      review_count: reviewCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId);

  if (updateError) {
    throw updateError;
  }

  return { rating, reviewCount };
}

