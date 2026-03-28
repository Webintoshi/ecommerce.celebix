import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    const { data: products, error } = await supabase
      .from("customer_preferred_products")
      .select("*")
      .eq("customer_id", id)
      .order("purchase_count", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, products: products || [] });
  } catch (error: any) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}
