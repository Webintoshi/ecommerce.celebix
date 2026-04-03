import { createServerClient } from "@/lib/supabase";
import { updateOrderStatus } from "@/lib/db/orders";
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

    const order = await updateOrderStatus(id, status);

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
