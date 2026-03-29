import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

function getDb() {
  return createServerClient();
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getDb();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");
    const sort = searchParams.get("sort") || "date-desc";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");

    let query = supabase
      .from("abandoned_carts")
      .select("*")
      .order("created_at", { ascending: sort === "date-asc" });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error } = await query.range(from, to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get total count
    let countQuery = supabase
      .from("abandoned_carts")
      .select("*", { count: "exact", head: true });

    if (status && status !== "all") {
      countQuery = countQuery.eq("status", status);
    }

    const { count } = await countQuery;

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
    const {
      session_id,
      customer_id,
      first_name,
      last_name,
      email,
      phone,
      is_anonymous,
      items,
      total,
      item_count,
      status,
    } = body;

    // Check if cart already exists for this session/customer
    let query = supabase.from("abandoned_carts");

    if (customer_id) {
      query = query.select("*").eq("customer_id", customer_id);
    } else if (session_id) {
      query = query.select("*").eq("session_id", session_id);
    }

    const { data: existing } = await query.single();

    if (existing) {
      // Update existing cart
      const { data, error } = await supabase
        .from("abandoned_carts")
        .update({
          items,
          total,
          item_count,
          first_name: first_name || existing.first_name,
          last_name: last_name || existing.last_name,
          email: email || existing.email,
          phone: phone || existing.phone,
          is_anonymous: is_anonymous ?? existing.is_anonymous,
          status: status || existing.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, cart: data });
    }

    // Create new cart
    const { data, error } = await supabase
      .from("abandoned_carts")
      .insert({
        session_id,
        customer_id,
        first_name,
        last_name,
        email,
        phone,
        is_anonymous: is_anonymous ?? true,
        items,
        total,
        item_count,
        status: status || "active",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, cart: data });
  } catch (error) {
    console.error("Error creating/updating abandoned cart:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = getDb();
    const body = await request.json();
    const { id, status, recovered } = body;

    if (!id) {
      return NextResponse.json({ error: "Cart ID required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};

    if (status) updateData.status = status;
    if (recovered !== undefined) {
      updateData.recovered = recovered;
      updateData.recovered_at = recovered ? new Date().toISOString() : null;
    }

    const { data, error } = await supabase
      .from("abandoned_carts")
      .update(updateData)
      .eq("id", id)
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

    if (!id) {
      return NextResponse.json({ error: "Cart ID required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("abandoned_carts")
      .delete()
      .eq("id", id);

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
