import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { uuid } from "@/lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

// GET - Get order notes (internal notes stored in order or separate table)
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    // Get order internal_notes field
    const { data: order } = await serverClient
      .from("orders")
      .select("internal_notes")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Get activity log for notes
    const { data: activityLogs } = await serverClient
      .from("order_activity_log")
      .select("*")
      .eq("order_id", id)
      .in("action", ["note_added", "note_updated", "note_deleted"])
      .order("created_at", { ascending: false });

    return NextResponse.json({
      internalNotes: order.internal_notes,
      activityLogs: activityLogs || [],
    });
  } catch (error) {
    console.error("Error fetching order notes:", error);
    return NextResponse.json(
      { error: "Failed to fetch order notes" },
      { status: 500 }
    );
  }
}

// POST - Add note to order
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const body = await request.json();
    const { text, adminId, adminName } = body;

    if (!text) {
      return NextResponse.json({ error: "Note text is required" }, { status: 400 });
    }

    // Add to activity log
    const { data: activityLog, error } = await serverClient
      .from("order_activity_log")
      .insert({
        id: uuid(),
        order_id: id,
        action: "note_added",
        new_value: { text },
        admin_id: adminId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activityLog });
  } catch (error) {
    console.error("Error adding note:", error);
    return NextResponse.json(
      { error: "Failed to add note" },
      { status: 500 }
    );
  }
}

// PUT - Update note
export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const body = await request.json();
    const { noteId, text, adminId, adminName } = body;

    if (!noteId || !text) {
      return NextResponse.json(
        { error: "Note ID and text are required" },
        { status: 400 }
      );
    }

    // Update activity log entry
    const { data: activityLog, error } = await serverClient
      .from("order_activity_log")
      .update({
        action: "note_updated",
        new_value: { text },
      })
      .eq("id", noteId)
      .eq("order_id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ activityLog });
  } catch (error) {
    console.error("Error updating note:", error);
    return NextResponse.json(
      { error: "Failed to update note" },
      { status: 500 }
    );
  }
}

// DELETE - Delete note
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get("noteId");

    if (!noteId) {
      return NextResponse.json(
        { error: "Note ID is required" },
        { status: 400 }
      );
    }

    // Delete activity log entry
    const { error } = await serverClient
      .from("order_activity_log")
      .delete()
      .eq("id", noteId)
      .eq("order_id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting note:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
