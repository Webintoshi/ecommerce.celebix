import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { paymentStatus, adminName = "Admin" } = body;

    if (!paymentStatus) {
      return NextResponse.json(
        { error: "Ödeme durumu gerekli" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "processing", "completed", "failed", "refunded"];
    if (!validStatuses.includes(paymentStatus)) {
      return NextResponse.json(
        { error: "Geçersiz ödeme durumu" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { data: order } = await supabase
      .from("orders")
      .select("payment_status, status")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json(
        { error: "Sipariş bulunamadı" },
        { status: 404 }
      );
    }

    await updatePaymentStatus(id, paymentStatus);

    try {
      await supabase.from("order_activity_log").insert({
        order_id: id,
        action: "payment_status_changed",
        old_value: order.payment_status,
        new_value: paymentStatus,
        admin_name: adminName,
      });
    } catch (logError) {
      console.error("Error creating activity log:", logError);
    }

    if (paymentStatus === "completed" && order.status === "pending") {
      try {
        await updateOrderStatus(id, "confirmed");
        try {
          await supabase.from("order_activity_log").insert({
            order_id: id,
            action: "status_changed",
            old_value: order.status,
            new_value: "confirmed",
            admin_name: adminName,
          });
        } catch (logError) {
          console.error("Error creating confirmation activity log:", logError);
        }
      } catch (statusError) {
        console.error("Error confirming order after completed payment:", statusError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment status update error:", error);
    return NextResponse.json(
      { error: "Sunucu hatasi" },
      { status: 500 }
    );
  }
}
