import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PRODUCT_REVIEW_STATUS,
  isProductReviewStatus,
} from "@celebix/platform-config/src/product-reviews";
import { cookies } from "next/headers";
import { recalculateProductReviewMetrics } from "@/lib/product-reviews";
import { getSessionUserFromCookies } from "@/lib/admin-session-cookie";
import {
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminProductReviewsDisabled,
} from "@/lib/light-postgres-readiness";
import { createServerClient } from "@/lib/supabase";

type RouteParams = {
  params: Promise<{ id: string }>;
};

function buildDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      code: DERYCRAFT_TEMPORARILY_DISABLED_CODE,
      error: "Urun yorumlari DeryCraft light_postgres provasinda gecici olarak pasif.",
    },
    { status: 503 },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (isAdminProductReviewsDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as { status?: string };
    const status = isProductReviewStatus(body?.status) ? body.status : null;

    if (!status) {
      return NextResponse.json({ success: false, error: "Gecersiz yorum durumu" }, { status: 400 });
    }

    const supabase = createServerClient();
    const cookieStore = await cookies();
    const user = await getSessionUserFromCookies(cookieStore.getAll());

    const {
      data: review,
      error: reviewError,
    } = await supabase
      .from("product_reviews")
      .select("id, product_id")
      .eq("id", id)
      .single();

    if (reviewError || !review) {
      return NextResponse.json({ success: false, error: "Yorum bulunamadi" }, { status: 404 });
    }

    const payload = {
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
      approved_by: status === "approved" ? user?.id || null : null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("product_reviews")
      .update(payload)
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    const metrics = await recalculateProductReviewMetrics(supabase, review.product_id);

    return NextResponse.json({
      success: true,
      status,
      metrics,
    });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Yorum guncellenemedi";

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (isAdminProductReviewsDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { id } = await params;
    const supabase = createServerClient();

    const {
      data: review,
      error: reviewError,
    } = await supabase
      .from("product_reviews")
      .select("id, product_id")
      .eq("id", id)
      .single();

    if (reviewError || !review) {
      return NextResponse.json({ success: false, error: "Yorum bulunamadi" }, { status: 404 });
    }

    const { error: deleteError } = await supabase.from("product_reviews").delete().eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    const metrics = await recalculateProductReviewMetrics(supabase, review.product_id);

    return NextResponse.json({
      success: true,
      status: DEFAULT_PRODUCT_REVIEW_STATUS,
      metrics,
    });
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "Yorum silinemedi";

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
