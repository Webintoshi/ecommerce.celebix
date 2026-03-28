import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

// GET - Get customer's orders
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const { searchParams } = new URL(request.url);
    const excludeOrderId = searchParams.get("exclude");
    const limit = parseInt(searchParams.get("limit") || "50");

    let query = serverClient
      .from("orders")
      .select(`
        *,
        items:order_items(*)
      `)
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (excludeOrderId) {
      query = query.neq("id", excludeOrderId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, orders: data || [] });
  } catch (error) {
    console.error("Error fetching customer orders:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customer orders" },
      { status: 500 }
    );
  }
}
