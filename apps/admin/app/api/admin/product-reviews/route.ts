import { NextRequest, NextResponse } from "next/server";
import { isProductReviewStatus } from "@celebix/platform-config/src/product-reviews";
import { listAdminProductReviews } from "@/lib/product-reviews";
import {
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminProductReviewsDisabled,
} from "@/lib/light-postgres-readiness";
import { createServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (isAdminProductReviewsDisabled()) {
    return NextResponse.json({
      success: true,
      status: DERYCRAFT_TEMPORARILY_DISABLED_CODE,
      reviews: [],
      counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
    });
  }

  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const query = searchParams.get("q") || "";

    const status =
      rawStatus === "all" || rawStatus === null
        ? "all"
        : isProductReviewStatus(rawStatus)
          ? rawStatus
          : null;

    if (status === null) {
      return NextResponse.json({ success: false, error: "Gecersiz yorum durumu" }, { status: 400 });
    }

    const reviews = await listAdminProductReviews(supabase, {
      status,
      query,
    });

    const counts = reviews.reduce(
      (accumulator, review) => {
        accumulator.all += 1;
        accumulator[review.status] += 1;
        return accumulator;
      },
      { all: 0, pending: 0, approved: 0, rejected: 0 },
    );

    return NextResponse.json({ success: true, reviews, counts });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Yorumlar yuklenemedi";

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
