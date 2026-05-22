import { getOrdersByCustomerId } from "@/lib/db/orders";
import { NextRequest, NextResponse } from "next/server";

interface Params {
  params: Promise<{ id: string }>;
}

// GET - Get customer's orders
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const excludeOrderId = searchParams.get("exclude");
    const limit = parseInt(searchParams.get("limit") || "50");

    const data = await getOrdersByCustomerId(id, {
      excludeOrderId,
      limit,
    });

    return NextResponse.json({ success: true, orders: data || [] });
  } catch (error) {
    console.error("Error fetching customer orders:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch customer orders" },
      { status: 500 }
    );
  }
}
