import { NextRequest, NextResponse } from "next/server";
import { MAX_PRODUCT_REVIEW_IMAGES } from "@celebix/platform-config/src/product-reviews";
import { createServerClient } from "@/lib/supabase";
import { isDerycraftLightPostgresRuntime } from "@/lib/derycraft-light-postgres";

function normalizeImageUrls(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0)
        .slice(0, MAX_PRODUCT_REVIEW_IMAGES)
    : [];
}

function getErrorMessage(error: unknown, fallback: string) {
  return error && typeof error === "object" && "message" in error
    ? String((error as { message: unknown }).message)
    : fallback;
}

function isMissingProductReviewsTableError(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();

  return (
    message.includes("product_reviews") &&
    (message.includes("schema cache") || message.includes("relation") || message.includes("does not exist"))
  );
}

export async function GET(request: NextRequest) {
  if (isDerycraftLightPostgresRuntime()) {
    return NextResponse.json({ success: true, reviews: [] });
  }

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");

    if (!productId) {
      return NextResponse.json({ success: false, error: "productId zorunludur" }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("product_reviews")
      .select("id, product_id, variant_id, reviewer_name, reviewer_email, rating, title, body, image_urls, created_at")
      .eq("product_id", productId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const reviews = (data || []).map((review) => ({
      id: String(review.id),
      productId: String(review.product_id),
      variantId: typeof review.variant_id === "string" ? review.variant_id : null,
      reviewerName: String(review.reviewer_name || ""),
      reviewerEmail: typeof review.reviewer_email === "string" ? review.reviewer_email : null,
      rating: Number(review.rating || 0),
      title: typeof review.title === "string" ? review.title : null,
      body: String(review.body || ""),
      imageUrls: normalizeImageUrls(review.image_urls),
      createdAt: String(review.created_at || ""),
    }));

    return NextResponse.json({ success: true, reviews });
  } catch (error: unknown) {
    if (isMissingProductReviewsTableError(error)) {
      return NextResponse.json({ success: true, reviews: [] });
    }

    const message = getErrorMessage(error, "Yorumlar yuklenemedi");

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isDerycraftLightPostgresRuntime()) {
    return NextResponse.json(
      {
        success: false,
        error: "Yorum sistemi gecici olarak devre disi.",
        code: "temporarily_disabled",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await request.json()) as {
      productId?: string;
      variantId?: string | null;
      reviewerName?: string;
      reviewerEmail?: string;
      rating?: number;
      title?: string;
      body?: string;
      imageUrls?: string[];
    };

    const productId = body.productId?.trim();
    const reviewerName = body.reviewerName?.trim();
    const reviewBody = body.body?.trim();
    const rating = Number(body.rating || 0);

    if (!productId || !reviewerName || !reviewBody || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "productId, reviewerName, body and a 1-5 rating are required" },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }

    const payload = {
      product_id: productId,
      variant_id: body.variantId?.trim() || null,
      reviewer_name: reviewerName,
      reviewer_email: body.reviewerEmail?.trim() || null,
      rating,
      title: body.title?.trim() || null,
      body: reviewBody,
      image_urls: normalizeImageUrls(body.imageUrls),
      status: "pending",
    };

    const { error } = await supabase.from("product_reviews").insert(payload);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Yorumunuz onay icin alindi. Onaylandiginda urunde yayinlanacak.",
    });
  } catch (error: unknown) {
    if (isMissingProductReviewsTableError(error)) {
      return NextResponse.json(
        { success: false, error: "Yorum sistemi henuz hazir degil. Lutfen biraz sonra tekrar deneyin." },
        { status: 503 },
      );
    }

    const message = getErrorMessage(error, "Yorum gonderilemedi");

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
