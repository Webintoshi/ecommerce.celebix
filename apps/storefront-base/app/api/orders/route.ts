import { NextRequest, NextResponse } from "next/server";
import {
    createOrder,
    getOrders,
    getOrderById,
    getOrderByNumber,
    updateOrderStatus,
    updatePaymentStatus,
    deleteOrder,
    getOrderStats
} from "@/lib/db/orders";

// GET /api/orders - Get orders or order stats
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        const orderNumber = searchParams.get("orderNumber");
        const stats = searchParams.get("stats");
        const status = searchParams.get("status");
        const limit = searchParams.get("limit");
        const offset = searchParams.get("offset");

        if (stats === "true") {
            const orderStats = await getOrderStats();
            return NextResponse.json({ success: true, stats: orderStats });
        }

        if (id) {
            const order = await getOrderById(id);
            return NextResponse.json({ success: true, order });
        }

        if (orderNumber) {
            const order = await getOrderByNumber(orderNumber);
            return NextResponse.json({ success: true, order });
        }

        const orders = await getOrders({
            status: status || undefined,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
        });

        return NextResponse.json({ success: true, orders });
    } catch (error: any) {
        console.error("Error fetching orders:", error);
        return NextResponse.json(
            { success: false, error: error?.message || "Failed to fetch orders" },
            { status: 500 }
        );
    }
}

// POST /api/orders - Create a new order
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const order = await createOrder({
            customerId: body.customerId,
            items: body.items,
            shippingAddress: body.shippingAddress,
            billingAddress: body.billingAddress,
            paymentMethod: body.paymentMethod,
            shippingCost: body.shippingCost,
            discount: body.discount,
            couponCode: body.couponCode,
            notes: body.notes,
            contactEmail: body.contactEmail,
        });

        return NextResponse.json({ success: true, order });
    } catch (error: any) {
        console.error("Error creating order:", error);
        return NextResponse.json(
            { success: false, error: error?.message || "Failed to create order" },
            { status: 500 }
        );
    }
}

// PATCH /api/orders - Update order status
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, status, paymentStatus } = body;

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Order ID is required" },
                { status: 400 }
            );
        }

        let order;
        if (status) {
            order = await updateOrderStatus(id, status);
        }
        if (paymentStatus) {
            order = await updatePaymentStatus(id, paymentStatus);
        }

        return NextResponse.json({ success: true, order });
    } catch (error: any) {
        console.error("Error updating order:", error);
        return NextResponse.json(
            { success: false, error: error?.message || "Failed to update order" },
            { status: 500 }
        );
    }
}

// DELETE /api/orders - Delete an order
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { success: false, error: "Order ID is required" },
                { status: 400 }
            );
        }

        await deleteOrder(id);
        return NextResponse.json({ success: true, message: "Order deleted" });
    } catch (error: any) {
        console.error("Error deleting order:", error);
        return NextResponse.json(
            { success: false, error: error?.message || "Failed to delete order" },
            { status: 500 }
        );
    }
}
