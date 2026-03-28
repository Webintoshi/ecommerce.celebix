import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH - Update order status
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const body = await request.json();
    const { status, notifyCustomer = false } = body;

    if (!status) {
      return NextResponse.json({ error: "Status is required" }, { status: 400 });
    }

    // Get current order for activity log
    const { data: currentOrder } = await serverClient
      .from("orders")
      .select("status")
      .eq("id", id)
      .single();

    if (!currentOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const oldStatus = currentOrder.status;

    // Update order status
    const { data: order, error } = await serverClient
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Create activity log
    await serverClient.from("order_activity_log").insert({
      order_id: id,
      action: "status_changed",
      old_value: oldStatus,
      new_value: status,
      created_at: new Date().toISOString(),
    });

    // TODO: Send customer notification if requested
    if (notifyCustomer) {
      // Send email/SMS notification
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json(
      { error: "Failed to update order status" },
      { status: 500 }
    );
  }
}
