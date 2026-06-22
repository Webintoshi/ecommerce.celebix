import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  type AbandonedCartStatus,
  clearAbandonedCartByLookup,
  findAbandonedCartByLookup,
  isAbandonedCartUnavailableError,
  markAbandonedCartAsRecovered,
  syncAbandonedCartStatuses,
  upsertAbandonedCart,
} from "@/lib/db/abandoned-carts";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import {
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminAbandonedCartDisabled,
} from "@/lib/light-postgres-readiness";

function getDb() {
  return createServerClient();
}

function buildDisabledResponse() {
  return NextResponse.json(
    {
      success: false,
      code: DERYCRAFT_TEMPORARILY_DISABLED_CODE,
      error: "Abandoned cart ozelligi DeryCraft light_postgres provasinda gecici olarak pasif.",
    },
    { status: 503 },
  );
}

function buildUnavailableResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "abandoned_cart_unavailable",
      error: "Abandoned cart tablosu bu runtime icin henuz hazir degil.",
    },
    { status: 503 },
  );
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

function applyFilters(
  query: any,
  {
    status,
    search,
    sort,
  }: {
    status: string | null;
    search: string | null;
    sort: string;
  }
) {
  let nextQuery = query;

  if (status === "all") {
    nextQuery = nextQuery.neq("status", "cleared");
  } else if (status === "recovered") {
    nextQuery = nextQuery.eq("status", "recovered");
  } else if (status) {
    nextQuery = nextQuery.eq("status", status);
  } else {
    nextQuery = nextQuery.in("status", ["abandoned", "recovered"]);
  }

  if (search?.trim()) {
    const term = search.trim();
    nextQuery = nextQuery.or(
      `cart_id.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }

  const orderColumn = sort.startsWith("total") ? "total" : "created_at";
  const ascending = sort === "date-asc" || sort === "total-asc";
  return nextQuery.order(orderColumn, { ascending });
}

async function requireSuperAdmin() {
  return requireAdminApiAuth({ roles: ["super_admin"] });
}

export async function GET(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireSuperAdmin();
    if (response) {
      return response;
    }

    const supabase = getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "date-desc";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    await syncAbandonedCartStatuses(supabase);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error } = await applyFilters(
      supabase.from("abandoned_carts").select("*"),
      { status, search, sort }
    ).range(from, to);

    if (error) {
      if (isAbandonedCartUnavailableError(error)) {
        return buildUnavailableResponse();
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count, error: countError } = await applyFilters(
      supabase.from("abandoned_carts").select("*", { count: "exact", head: true }),
      { status, search, sort }
    );

    if (countError) {
      if (isAbandonedCartUnavailableError(countError)) {
        return buildUnavailableResponse();
      }
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      carts: data,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching abandoned carts:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireSuperAdmin();
    if (response) {
      return response;
    }

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

    return NextResponse.json({ success: true, cart });
  } catch (error) {
    console.error("Error creating/updating abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireSuperAdmin();
    if (response) {
      return response;
    }

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

      return NextResponse.json({ success: true, cart });
    }

    if (status === "cleared") {
      const cart = await clearAbandonedCartByLookup(lookup, supabase);
      return NextResponse.json({ success: true, cart });
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
    const orderId = readBodyString(body, "orderId", "order_id");

    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (orderId) updateData.order_id = orderId;
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

    return NextResponse.json({ success: true, cart: data });
  } catch (error) {
    console.error("Error updating abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireSuperAdmin();
    if (response) {
      return response;
    }

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
    return NextResponse.json({ success: true, cart });
  } catch (error) {
    console.error("Error clearing abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return buildUnavailableResponse();
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
