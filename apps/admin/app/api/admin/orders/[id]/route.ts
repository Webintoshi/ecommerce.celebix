import { createServerClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // First, delete related records
    // Delete activity logs
    await supabase.from("order_activity_log").delete().eq("order_id", id);

    // Delete order items
    await supabase.from("order_items").delete().eq("order_id", id);

    // Delete the order
    const { error } = await supabase.from("orders").delete().eq("id", id);

    if (error) {
      console.error("Error deleting order:", error);
      return NextResponse.json(
        { error: "Sipariş silinirken bir hata oluştu." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete order error:", error);
    return NextResponse.json(
      { error: "Sunucu hatası" },
      { status: 500 }
    );
  }
}
