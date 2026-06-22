import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  type AbandonedCartStatus,
  clearAbandonedCartByLookup,
  findAbandonedCartByLookup,
  isAbandonedCartUnavailableError,
  markAbandonedCartAsRecovered,
  upsertAbandonedCart,
} from "@/lib/db/abandoned-carts";

function getDb() {
  return createServerClient();
}

function readBodyString(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readBodyNumber(body: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function readBodyBoolean(body: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function splitFullName(fullName: string | null) {
  if (!fullName) {
    return { firstName: null, lastName: null };
  }

  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

function resolveCustomerNameParts(body: Record<string, unknown>) {
  const explicitFullName = readBodyString(body, "customerName", "customer_name", "name");

  if (explicitFullName) {
    return splitFullName(explicitFullName);
  }

  const firstName = readBodyString(body, "firstName", "first_name");
  const lastName = readBodyString(body, "lastName", "last_name");

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  return {
    firstName: readBodyString(body, "billingFirstName", "billing_first_name"),
    lastName: readBodyString(body, "billingLastName", "billing_last_name"),
  };
}

function resolveCustomerEmail(body: Record<string, unknown>) {
  return readBodyString(body, "customerEmail", "customer_email", "email", "billingEmail", "billing_email");
}

function resolveCustomerPhone(body: Record<string, unknown>) {
  return readBodyString(body, "customerPhone", "customer_phone", "phone", "billingPhone", "billing_phone");
}

function resolveStatus(value: string | null): AbandonedCartStatus | null {
  if (value === "active" || value === "abandoned" || value === "recovered" || value === "cleared") {
    return value;
  }

  return null;
}

function resolveLookup(body: Record<string, unknown>) {
  return {
    id: readBodyString(body, "id") ?? undefined,
    cartId: readBodyString(body, "cartId", "cart_id"),
    sessionId: readBodyString(body, "sessionId", "session_id"),
    customerId: readBodyString(body, "customerId", "customer_id"),
    email: resolveCustomerEmail(body),
  };
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

function handledTrackingError(error: unknown) {
  return isAbandonedCartUnavailableError(error) || isRecoverableTrackingError(error);
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
    const { firstName, lastName } = resolveCustomerNameParts(body);

    const cart = await upsertAbandonedCart(
      {
        cartId: readBodyString(body, "cartId", "cart_id"),
        sessionId: readBodyString(body, "sessionId", "session_id"),
        customerId: readBodyString(body, "customerId", "customer_id"),
        firstName,
        lastName,
        email: resolveCustomerEmail(body),
        phone: resolveCustomerPhone(body),
        isAnonymous: readBodyBoolean(body, "isAnonymous", "is_anonymous"),
        items: Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : undefined,
        total: readBodyNumber(body, "total"),
        itemCount: readBodyNumber(body, "itemCount", "item_count"),
        status: resolveStatus(readBodyString(body, "status")),
        checkoutStartedAt: readBodyString(body, "checkoutStartedAt", "checkout_started_at"),
        orderId: readBodyString(body, "orderId", "order_id"),
      },
      supabase,
    );

    return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(cart) });
  } catch (error) {
    console.error("Error creating/updating abandoned cart:", error);
    if (handledTrackingError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getDb();
    const body = await request.json();
    const lookup = resolveLookup(body);
    const status = readBodyString(body, "status");
    const recovered = readBodyBoolean(body, "recovered");

    if (!lookup.id && !lookup.cartId && !lookup.sessionId && !lookup.customerId && !lookup.email) {
      return NextResponse.json({ error: "Cart lookup required" }, { status: 400 });
    }

    if (recovered === true) {
      const cart = await markAbandonedCartAsRecovered(
        lookup,
        { orderId: readBodyString(body, "orderId", "order_id") },
        supabase,
      );

      if (!cart) {
        return NextResponse.json({ error: "Cart not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(cart) });
    }

    if (status === "cleared") {
      const cart = await clearAbandonedCartByLookup(lookup, supabase);
      return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(cart) });
    }

    const existing = await findAbandonedCartByLookup(lookup, undefined, supabase);

    if (!existing) {
      return NextResponse.json({ error: "Cart not found" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const updateData: Record<string, unknown> = {};
    const { firstName, lastName } = resolveCustomerNameParts(body);
    const email = resolveCustomerEmail(body);
    const phone = resolveCustomerPhone(body);

    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (email || phone || firstName || lastName) updateData.is_anonymous = false;

    if (status) {
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
      return NextResponse.json({ error: "No update payload provided" }, { status: 400 });
    }

    updateData.last_activity_at = nowIso;
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
    if (handledTrackingError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = getDb();
    const { searchParams } = new URL(request.url);
    const lookup = {
      id: searchParams.get("id") || undefined,
      cartId: searchParams.get("cartId") || searchParams.get("cart_id"),
      sessionId: searchParams.get("sessionId") || searchParams.get("session_id"),
      customerId: searchParams.get("customerId") || searchParams.get("customer_id"),
      email: searchParams.get("email"),
    };

    if (!lookup.id && !lookup.cartId && !lookup.sessionId && !lookup.customerId && !lookup.email) {
      return NextResponse.json({ error: "Cart lookup required" }, { status: 400 });
    }

    const cart = await clearAbandonedCartByLookup(lookup, supabase);
    return NextResponse.json({ success: true, cart: sanitizePublicAbandonedCart(cart) });
  } catch (error) {
    console.error("Error clearing abandoned cart:", error);
    if (handledTrackingError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
