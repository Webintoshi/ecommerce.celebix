import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  deleteLatestOpenAbandonedCartForSession,
  findAbandonedCartByLookup,
  isAbandonedCartUnavailableError,
  markAbandonedCartAsRecovered,
  upsertAbandonedCart,
} from "@/lib/db/abandoned-carts";

function getDb() {
  return createServerClient();
}

function sanitizePublicAbandonedCart(cart: any) {
  if (!cart || typeof cart !== "object") {
    return null;
  }

  return {
    id: typeof cart.id === "string" ? cart.id : null,
    cartId: typeof cart.cart_id === "string" ? cart.cart_id : null,
    status: typeof cart.status === "string" ? cart.status : cart.recovered ? "recovered" : "active",
    total: typeof cart.total === "number" ? cart.total : Number(cart.total || 0),
    itemCount: typeof cart.item_count === "number" ? cart.item_count : 0,
    recovered: Boolean(cart.recovered),
    checkoutStartedAt: typeof cart.checkout_started_at === "string" ? cart.checkout_started_at : null,
    lastActivityAt:
      typeof cart.last_activity_at === "string"
        ? cart.last_activity_at
        : typeof cart.updated_at === "string"
          ? cart.updated_at
          : null,
  };
}

function buildUnavailableResponse() {
  return NextResponse.json({
    success: true,
    cart: null,
    disabled: true,
    code: "abandoned_cart_unavailable",
    message: "Abandoned cart tracking is not available for this store runtime yet.",
  });
}

function isRecoverableTrackingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return message.includes("Yeni bir sepet kaydi icin urunler ve toplam tutar gereklidir");
}

export async function GET(request: NextRequest) {
  void request;
  return NextResponse.json(
    {
      success: false,
      code: "abandoned_cart_public_read_disabled",
      error: "Abandoned cart records are not exposed from the storefront API.",
    },
    { status: 405 },
  );
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getDb();
    const body = await request.json();

    const cart = await upsertAbandonedCart(
      {
        cartId: body.cart_id,
        sessionId: body.session_id,
        customerId: body.customer_id,
        firstName: body.first_name,
        lastName: body.last_name,
        email: body.email,
        phone: body.phone,
        isAnonymous: body.is_anonymous,
        items: body.items,
        total: typeof body.total === "number" ? body.total : undefined,
        itemCount: typeof body.item_count === "number" ? body.item_count : undefined,
        status: body.status,
        checkoutStartedAt: typeof body.checkout_started_at === "string" ? body.checkout_started_at : undefined,
      },
      supabase
    );

    return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(cart) });
  } catch (error) {
    console.error("Error creating/updating abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error) || isRecoverableTrackingError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getDb();
    const body = await request.json();
    const { id, session_id, customer_id, email, status, recovered } = body;

    if (!id && !session_id && !customer_id && !email) {
      return NextResponse.json(
        { error: "Cart lookup required" },
        { status: 400 }
      );
    }

    if (recovered === true) {
      const cart = await markAbandonedCartAsRecovered(
        {
          id,
          cartId: body.cart_id,
          sessionId: session_id,
          customerId: customer_id,
          email,
        },
        supabase
      );

      if (!cart) {
        return NextResponse.json({ error: "Cart not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(cart) });
    }

    const existing = await findAbandonedCartByLookup(
      {
        id,
        sessionId: session_id,
        customerId: customer_id,
        email,
      },
      undefined,
      supabase
    );

    if (!existing) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const updateData: Record<string, unknown> = {};

    if (typeof status === "string" && status.trim()) {
      updateData.status = status;

      if (status === "recovered") {
        updateData.recovered = true;
        updateData.recovered_at = nowIso;
      } else {
        updateData.recovered = false;
        updateData.recovered_at = null;
        updateData.abandoned_at = status === "abandoned" ? existing.abandoned_at || nowIso : null;
      }
    }

    if (recovered === false) {
      updateData.recovered = false;
      updateData.recovered_at = null;
      if (!updateData.status) {
        updateData.status = "abandoned";
        updateData.abandoned_at = existing.abandoned_at || nowIso;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No update payload provided" },
        { status: 400 }
      );
    }

    updateData.updated_at = nowIso;

    const { data, error } = await supabase
      .from("abandoned_carts")
      .update(updateData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      if (isAbandonedCartUnavailableError(error)) {
        return buildUnavailableResponse();
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(data) });
  } catch (error) {
    console.error("Error updating abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const sessionId = searchParams.get("session_id");

    if (!id && !sessionId) {
      return NextResponse.json({ error: "Cart lookup required" }, { status: 400 });
    }

    if (sessionId && !id) {
      await deleteLatestOpenAbandonedCartForSession(sessionId, supabase);
      return NextResponse.json({ success: true });
    }

    const { error } = await supabase
      .from("abandoned_carts")
      .delete()
      .eq("id", id as string);

    if (error) {
      if (isAbandonedCartUnavailableError(error)) {
        return NextResponse.json({ success: true, disabled: true, code: "abandoned_cart_unavailable" });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return NextResponse.json({ success: true, disabled: true, code: "abandoned_cart_unavailable" });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
