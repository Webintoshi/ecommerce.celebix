import { NextRequest, NextResponse } from "next/server";
import { getActivePaymentGatewayById } from "@/lib/db/payment-gateways";
import { createOrder, updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { initializePayment } from "@/lib/payment-runtime";
import { loadCheckoutPricingData, resolveCheckoutCustomer } from "./checkout-data";
import { CheckoutInputError, checkoutPaymentItems, parseCheckoutInput, priceCheckout } from "./checkout-pricing";

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
        const input = parseCheckoutInput(await request.json().catch(() => null));
        const gateway = await getActivePaymentGatewayById(input.paymentMethod);
        if (!gateway) {
            return NextResponse.json({ success: false, error: "Seçilen ödeme yöntemi aktif değil." }, { status: 404 });
        }

        const pricing = priceCheckout(input, await loadCheckoutPricingData(input));
        const customer = await resolveCheckoutCustomer(input.contactEmail);
        const order = await createOrder({
            ...customer,
            ...pricing,
            shippingAddress: input.shippingAddress,
            billingAddress: input.billingAddress,
            paymentMethod: gateway.id,
            couponCode: input.couponCode,
            notes: input.notes,
            contactEmail: input.contactEmail,
            abandonedCartSessionId: input.abandonedCartSessionId,
        });

        if (gateway.gateway === "cod") {
            await updatePaymentStatus(order.id, "completed");
            await updateOrderStatus(order.id, "confirmed");

            return NextResponse.json({
                success: true,
                order,
                payment: {
                    action: "success",
                    paymentAttemptId: "manual",
                },
            });
        }

        if (gateway.gateway === "bank_transfer") {
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
                items: checkoutPaymentItems(gateway.gateway, pricing),
                customerEmail: input.contactEmail,
                customerIp: getRequestIp(request),
                shippingAddress: input.shippingAddress,
                billingAddress: input.billingAddress,
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
                    error: paymentError instanceof Error ? paymentError.message : "Ödeme başlatılamadı.",
                    order,
                },
                { status: 502 },
            );
        }
    } catch (error) {
        if (error instanceof CheckoutInputError) {
            return NextResponse.json({ success: false, error: error.message }, { status: 422 });
        }
        console.error("Payment checkout error:", error);
        return NextResponse.json(
            { success: false, error: "Ödeme işlemi başlatılamadı." },
            { status: 500 },
        );
    }
}
