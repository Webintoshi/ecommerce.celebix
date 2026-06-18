import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  deleteLatestOpenAbandonedCartForSession,
  findAbandonedCartByLookup,
  markAbandonedCartAsRecovered,
  syncAbandonedCartStatuses,
  upsertAbandonedCart,
} from "@/lib/db/abandoned-carts";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { buildOptionalModuleDisabledPayload, isMissingDatabaseObjectError } from "@/lib/db/light-postgres-compat";

function getDb() {
  return createServerClient();
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
  try {
    const { response } = await requireAdminApiAuth();
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { count, error: countError } = await applyFilters(
      supabase.from("abandoned_carts").select("*", { count: "exact", head: true }),
      { status, search, sort }
    );

    if (countError) {
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
    if (isMissingDatabaseObjectError(error)) {
      return NextResponse.json({
        success: true,
        carts: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 },
        ...buildOptionalModuleDisabledPayload("abandoned_carts"),
      });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getDb();
    const body = await request.json();

    const cart = await upsertAbandonedCart(
      {
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
      },
      supabase
    );

    return NextResponse.json({ success: true, cart });
  } catch (error) {
    console.error("Error creating/updating abandoned cart:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { response } = await requireAdminApiAuth();
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
          sessionId: session_id,
          customerId: customer_id,
          email,
        },
        supabase
      );

      if (!cart) {
        return NextResponse.json({ error: "Cart not found" }, { status: 404 });
      }

      return NextResponse.json({ success: true, cart });
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cart: data });
  } catch (error) {
    console.error("Error updating abandoned cart:", error);
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

    if (id) {
      const { response } = await requireAdminApiAuth();
      if (response) {
        return response;
      }
    }

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting abandoned cart:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
