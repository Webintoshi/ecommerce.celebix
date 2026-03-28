import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

// GET - Get order activity log
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");

    let query = serverClient
      .from("order_activity_log")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false });

    if (action) {
      query = query.eq("action", action);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activities: data || [] });
  } catch (error) {
    console.error("Error fetching activity log:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity log" },
      { status: 500 }
    );
  }
}

// POST - Add activity log entry
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const body = await request.json();
    const { action, oldValue, newValue, adminId, adminName } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const { data, error } = await serverClient
      .from("order_activity_log")
      .insert({
        order_id: id,
        action,
        old_value: oldValue,
        new_value: newValue,
        admin_id: adminId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activity: data });
  } catch (error) {
    console.error("Error adding activity log:", error);
    return NextResponse.json(
      { error: "Failed to add activity log" },
      { status: 500 }
    );
  }
}
