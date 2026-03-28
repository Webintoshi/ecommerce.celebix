import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { enqueueOrderStatusSync } from "@/lib/db/marketplace-sync";

interface Params {
  params: Promise<{ id: string }>;
}

// PATCH - Update shipping info
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const serverClient = createServerClient();

  try {
    const body = await request.json();
    const { carrier, trackingNumber, notifyCustomer = false } = body;

    // Get current order for activity log
    const { data: currentOrder } = await serverClient
      .from("orders")
      .select("status, shipping_carrier, tracking_number")
      .eq("id", id)
      .single();

    if (!currentOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Update order shipping info
    const updateData: Record<string, unknown> = {};
    if (carrier !== undefined) updateData.shipping_carrier = carrier;
    if (trackingNumber !== undefined) updateData.tracking_number = trackingNumber;

    // Update order status to shipped if tracking number is added and status is preparing
    if (trackingNumber && currentOrder.status === "preparing") {
      updateData.status = "shipped";
    }

    const { data: order, error } = await serverClient
      .from("orders")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Create activity log
    await serverClient.from("order_activity_log").insert({
      order_id: id,
      action: "shipping_updated",
      old_value: {
        carrier: currentOrder.shipping_carrier,
        trackingNumber: currentOrder.tracking_number,
      },
      new_value: {
        carrier: carrier || currentOrder.shipping_carrier,
        trackingNumber: trackingNumber || currentOrder.tracking_number,
      },
      created_at: new Date().toISOString(),
    });

    // If status changed to shipped, log that too
    if (updateData.status === "shipped") {
      await serverClient.from("order_activity_log").insert({
        order_id: id,
        action: "status_changed",
        old_value: "preparing",
        new_value: "shipped",
        created_at: new Date().toISOString(),
      });
    }

    // TODO: Send customer notification if requested
    if (notifyCustomer) {
      // Send SMS with tracking info
    }

    try {
      await enqueueOrderStatusSync(id);
    } catch (marketplaceError) {
      console.error("Marketplace queue error (shipping update):", marketplaceError);
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Error updating shipping info:", error);
    return NextResponse.json(
      { error: "Failed to update shipping info" },
      { status: 500 }
    );
  }
}
