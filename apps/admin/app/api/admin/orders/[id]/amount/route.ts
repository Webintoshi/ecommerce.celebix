import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { discount, note, adminName = "Admin" } = body;

    if (note && typeof note !== "string") {
      return NextResponse.json(
        { error: "Not metni geçersiz" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get current order
    const { data: order } = await supabase
      .from("orders")
      .select("subtotal, shipping_cost, discount, total")
      .eq("id", id)
      .single();

    if (!order) {
      return NextResponse.json(
        { error: "Sipariş bulunamadı" },
        { status: 404 }
      );
    }

    const newDiscount = typeof discount === "number" ? discount : order.discount;
    const newTotal = order.subtotal - newDiscount + order.shipping_cost;

    // Update order
    const { error } = await supabase
      .from("orders")
      .update({ discount: newDiscount, total: newTotal })
      .eq("id", id);

    if (error) {
      console.error("Error updating order amount:", error);
      return NextResponse.json(
        { error: "Tutar güncellenirken bir hata oluştu." },
        { status: 500 }
      );
    }

    // Add activity log
    if (note) {
      try {
        await supabase.from("order_activity_log").insert({
          order_id: id,
          action: "note_added",
          new_value: {
            text: `Tutar güncellendi: ${newDiscount >= 0 ? "+" : ""}${newDiscount}₺. ${note}`,
          },
          admin_name: adminName,
        });
      } catch (logError) {
        console.error("Error creating activity log:", logError);
      }
    }

    return NextResponse.json({
      success: true,
      newDiscount,
      newTotal,
    });
  } catch (error) {
    console.error("Amount update error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
