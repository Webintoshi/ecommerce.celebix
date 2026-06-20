import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  deleteLatestOpenAbandonedCartForSession,
  findAbandonedCartByLookup,
  isAbandonedCartUnavailableError,
  markAbandonedCartAsRecovered,
  syncAbandonedCartStatuses,
  upsertAbandonedCart,
} from "@/lib/db/abandoned-carts";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { buildOptionalModuleDisabledPayload, isMissingDatabaseObjectError } from "@/lib/db/light-postgres-compat";
import {
  DERYCRAFT_TEMPORARILY_DISABLED_CODE,
  isAdminAbandonedCartDisabled,
} from "@/lib/light-postgres-readiness";
import type { UserRole } from "@/lib/permissions";

const ABANDONED_CART_FULL_PII_ROLES: UserRole[] = ["super_admin"];

type AbandonedCartApiRow = Record<string, unknown>;

function getDb() {
  return createServerClient();
}

function requireAbandonedCartPiiAuth() {
  return requireAdminApiAuth({ roles: ABANDONED_CART_FULL_PII_ROLES });
}

function buildPiiPolicyMeta() {
  return {
    piiPolicy: {
      visibility: "full",
      roles: ABANDONED_CART_FULL_PII_ROLES,
    },
  };
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readRowString(row: AbandonedCartApiRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
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

function resolveCustomerNameParts(row: AbandonedCartApiRow) {
  const explicitFullName = readRowString(row, "customerName", "customer_name", "name");

  if (explicitFullName) {
    return splitFullName(explicitFullName);
  }

  const firstName = readRowString(row, "firstName", "first_name");
  const lastName = readRowString(row, "lastName", "last_name");

  if (firstName || lastName) {
    return { firstName, lastName };
  }

  return {
    firstName: readRowString(row, "billingFirstName", "billing_first_name"),
    lastName: readRowString(row, "billingLastName", "billing_last_name"),
  };
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function normalizeStatus(row: AbandonedCartApiRow) {
  const status = readString(row.status);
  if (status === "active" || status === "abandoned" || status === "recovered" || status === "cleared") {
    return status;
  }

  return row.recovered ? "recovered" : "abandoned";
}

function normalizeItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function calculateItemCount(items: Record<string, unknown>[]) {
  return items.reduce((total, item) => {
    const quantity = item.quantity;
    if (typeof quantity === "number" && Number.isFinite(quantity)) {
      return total + quantity;
    }

    if (typeof quantity === "string") {
      const parsed = Number(quantity);
      return total + (Number.isFinite(parsed) ? parsed : 1);
    }

    return total + 1;
  }, 0);
}

function buildCustomerName(firstName: string | null, lastName: string | null) {
  const fullName = `${firstName || ""} ${lastName || ""}`.trim();
  return fullName || "Anonim sepet";
}

function mapAdminAbandonedCart(row: AbandonedCartApiRow) {
  const items = normalizeItems(row.items);
  const { firstName, lastName } = resolveCustomerNameParts(row);
  const email = readString(row.email ?? row.customerEmail);
  const phone = readString(row.phone ?? row.customerPhone);
  const status = normalizeStatus(row);
  const itemCount = readNumber(row.item_count ?? row.itemCount) || calculateItemCount(items);
  const lastActivityAt =
    readString(row.last_activity_at ?? row.lastActivityAt) ||
    readString(row.updated_at ?? row.updatedAt) ||
    readString(row.created_at ?? row.createdAt);

  return {
    ...row,
    cartId: readString(row.cart_id ?? row.cartId),
    storeSlug: readString(row.store_slug ?? row.storeSlug),
    customerId: readString(row.customer_id ?? row.customerId),
    sessionId: readString(row.session_id ?? row.sessionId),
    firstName,
    lastName,
    email,
    phone,
    customerName: buildCustomerName(firstName, lastName),
    customerEmail: email,
    customerPhone: phone,
    items,
    total: readNumber(row.total),
    itemCount,
    status,
    lastActivityAt,
    checkoutStartedAt: readString(row.checkout_started_at ?? row.checkoutStartedAt),
    recovered: Boolean(row.recovered) || status === "recovered",
    orderId: readString(row.order_id ?? row.orderId),
    createdAt: readString(row.created_at ?? row.createdAt),
    updatedAt: readString(row.updated_at ?? row.updatedAt),
    recoveredAt: readString(row.recovered_at ?? row.recoveredAt),
    abandonedAt: readString(row.abandoned_at ?? row.abandonedAt),
    isAnonymous:
      typeof row.is_anonymous === "boolean"
        ? row.is_anonymous
        : typeof row.isAnonymous === "boolean"
          ? row.isAnonymous
          : !Boolean(firstName || lastName || email || phone),
  };
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

function isAbandonedCartReadUnavailable(error: unknown) {
  return isMissingDatabaseObjectError(error) || isAbandonedCartUnavailableError(error);
}

function buildSafeEmptyResponse({
  carts = [],
  page = 1,
  limit = 20,
  message = "Abandoned cart tablosu bu runtime icin henuz hazir degil.",
}: {
  carts?: unknown[];
  page?: number;
  limit?: number;
  message?: string;
} = {}) {
  return NextResponse.json({
    success: true,
    code: "abandoned_cart_unavailable",
    message,
    carts,
    pagination: {
      page,
      limit,
      total: 0,
      pages: 0,
    },
    ...buildOptionalModuleDisabledPayload("abandoned_carts", message),
    ...buildPiiPolicyMeta(),
  });
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
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
    );
  }

  const orderColumn = sort.startsWith("total") ? "total" : "created_at";
  const ascending = sort === "date-asc" || sort === "total-asc";
  return nextQuery.order(orderColumn, { ascending });
}

export async function GET(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireAbandonedCartPiiAuth();
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
      if (isAbandonedCartReadUnavailable(error)) {
        return buildSafeEmptyResponse({ page, limit });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count, error: countError } = await applyFilters(
      supabase.from("abandoned_carts").select("*", { count: "exact", head: true }),
      { status, search, sort }
    );

    if (countError) {
      if (isAbandonedCartReadUnavailable(countError)) {
        return buildSafeEmptyResponse({
          carts: ((data || []) as AbandonedCartApiRow[]).map(mapAdminAbandonedCart),
          page,
          limit,
        });
      }
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      carts: ((data || []) as AbandonedCartApiRow[]).map(mapAdminAbandonedCart),
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
      ...buildPiiPolicyMeta(),
    });
  } catch (error) {
    console.error("Error fetching abandoned carts:", error);
    if (isAbandonedCartReadUnavailable(error)) {
      return buildSafeEmptyResponse();
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireAbandonedCartPiiAuth();
    if (response) {
      return response;
    }

    const supabase = getDb();
    const body = await request.json();
    const { firstName, lastName } = resolveCustomerNameParts(body);

    const cart = await upsertAbandonedCart(
      {
        cartId: body.cart_id,
        sessionId: body.session_id,
        customerId: body.customer_id,
        firstName,
        lastName,
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

    return NextResponse.json({ success: true, cart: mapAdminAbandonedCart(cart as AbandonedCartApiRow), ...buildPiiPolicyMeta() });
  } catch (error) {
    console.error("Error creating/updating abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return NextResponse.json(
        { success: false, code: "abandoned_cart_unavailable", error: "Abandoned cart tablosu hazir degil." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireAbandonedCartPiiAuth();
    if (response) {
      return response;
    }

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

      return NextResponse.json({ success: true, cart: mapAdminAbandonedCart(cart as AbandonedCartApiRow), ...buildPiiPolicyMeta() });
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
    const { firstName, lastName } = resolveCustomerNameParts(body);

    if (firstName) {
      updateData.first_name = firstName;
    }

    if (lastName) {
      updateData.last_name = lastName;
    }

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
        return NextResponse.json(
          { success: false, code: "abandoned_cart_unavailable", error: "Abandoned cart tablosu hazir degil." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cart: mapAdminAbandonedCart(data as AbandonedCartApiRow), ...buildPiiPolicyMeta() });
  } catch (error) {
    console.error("Error updating abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return NextResponse.json(
        { success: false, code: "abandoned_cart_unavailable", error: "Abandoned cart tablosu hazir degil." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (isAdminAbandonedCartDisabled()) {
    return buildDisabledResponse();
  }

  try {
    const { response } = await requireAbandonedCartPiiAuth();
    if (response) {
      return response;
    }

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
        return NextResponse.json({ success: true, code: "abandoned_cart_unavailable" });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting abandoned cart:", error);
    if (isAbandonedCartUnavailableError(error)) {
      return NextResponse.json({ success: true, code: "abandoned_cart_unavailable" });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
