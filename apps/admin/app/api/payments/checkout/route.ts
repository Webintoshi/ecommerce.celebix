import { NextRequest, NextResponse } from "next/server";
import { getActivePaymentGatewayById } from "@/lib/db/payment-gateways";
import { createOrder, updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { initializePayment } from "@/lib/payment-runtime";

function getBaseUrl(request: NextRequest) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");

    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }

    return new URL(request.url).origin;
}

function getRequestIp(request: NextRequest) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
        return forwardedFor.split(",")[0]?.trim() || "127.0.0.1";
    }

    const realIp = request.headers.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    return "127.0.0.1";
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        if (!body?.paymentMethod) {
            return NextResponse.json({ success: false, error: "Odeme yontemi secilmelidir." }, { status: 422 });
        }

        const gateway = await getActivePaymentGatewayById(body.paymentMethod);
        if (!gateway) {
            return NextResponse.json({ success: false, error: "Secilen odeme yontemi aktif degil." }, { status: 404 });
        }

        const order = await createOrder({
            customerId: body.customerId,
            items: body.items,
            shippingAddress: body.shippingAddress,
            billingAddress: body.billingAddress,
            paymentMethod: body.paymentMethod,
            shippingCost: body.shippingCost,
            discount: body.discount,
            notes: body.notes,
            contactEmail: body.contactEmail,
        });

        if (gateway.gateway === "bank_transfer" || gateway.gateway === "cod") {
            return NextResponse.json({
                success: true,
                order,
                payment: {
                    action: "success",
                    paymentAttemptId: "manual",
                },
            });
        }

        try {
            await updatePaymentStatus(order.id, "processing");

            const payment = await initializePayment({
                gateway,
                order: {
                    id: order.id,
                    order_number: order.order_number,
                    total: Number(order.total),
                    currency: gateway.currency,
                },
                items: body.items,
                customerEmail: body.contactEmail,
                customerIp: getRequestIp(request),
                shippingAddress: body.shippingAddress,
                billingAddress: body.billingAddress || body.shippingAddress,
                siteUrl: getBaseUrl(request),
            });

            return NextResponse.json({
                success: true,
                order,
                payment,
            });
        } catch (paymentError) {
            await updatePaymentStatus(order.id, "failed");
            await updateOrderStatus(order.id, "cancelled");

            return NextResponse.json(
                {
                    success: false,
                    error: paymentError instanceof Error ? paymentError.message : "Odeme baslatilamadi.",
                    order,
                },
                { status: 502 },
            );
        }
    } catch (error) {
        console.error("Payment checkout error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Checkout baslatilamadi." },
            { status: 500 },
        );
    }
}
