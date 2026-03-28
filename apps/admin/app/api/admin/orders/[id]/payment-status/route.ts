import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { enqueueAndProcessInvoiceForOrder } from "@/lib/db/accounting";

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

    // Get current order
    const { data: order } = await supabase
      .from("orders")
      .select("payment_status")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json(
        { error: "Sipariş bulunamadı" },
        { status: 404 }
      );
    }

    // Update payment status
    const { error } = await supabase
      .from("orders")
      .update({ payment_status: paymentStatus })
      .eq("id", id);

    if (error) {
      console.error("Error updating payment status:", error);
      return NextResponse.json(
        { error: "Ödeme durumu güncellenirken bir hata oluştu." },
        { status: 500 }
      );
    }

    // Add activity log
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
      // Don't fail the request if log fails
    }

    if (paymentStatus === "completed") {
      try {
        await enqueueAndProcessInvoiceForOrder(id);
      } catch (accountingError) {
        console.error("Accounting queue error (admin payment status):", accountingError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment status update error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
