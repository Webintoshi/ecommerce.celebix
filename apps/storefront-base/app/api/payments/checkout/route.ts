import { NextRequest, NextResponse } from "next/server";
import { getActivePaymentGatewayById } from "@/lib/db/payment-gateways";
import { createOrder, updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { initializePayment, PaymentCheckoutError } from "@/lib/payment-runtime";

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
        const normalizedShippingCost = Number(body?.shippingCost || 0);
        const normalizedDiscount = Number(body?.discount || 0);

        if (!body?.paymentMethod) {
            return NextResponse.json({ success: false, error: "Odeme yontemi secilmelidir." }, { status: 422 });
        }

        if (!Array.isArray(body?.items) || body.items.length === 0) {
            return NextResponse.json({ success: false, error: "Sepet bos oldugu icin odeme baslatilamadi." }, { status: 422 });
        }

        if (!body?.contactEmail?.trim()) {
            return NextResponse.json({ success: false, error: "Iletisim e-posta adresi zorunludur." }, { status: 422 });
        }

        const gateway = await getActivePaymentGatewayById(body.paymentMethod);
        if (!gateway) {
            return NextResponse.json({ success: false, error: "Secilen odeme yontemi aktif degil ya da yeniden secilmelidir." }, { status: 422 });
        }

        const order = await createOrder({
            customerId: body.customerId,
            items: body.items,
            shippingAddress: body.shippingAddress,
            billingAddress: body.billingAddress,
            paymentMethod: body.paymentMethod,
            shippingCost: normalizedShippingCost,
            discount: normalizedDiscount,
            notes: body.notes,
            contactEmail: body.contactEmail,
            abandonedCartSessionId: body.abandonedCartSessionId,
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
                items: body.items,
                customerEmail: body.contactEmail,
                customerIp: getRequestIp(request),
                shippingAddress: body.shippingAddress,
                billingAddress: body.billingAddress || body.shippingAddress,
                shippingCost: normalizedShippingCost,
                discount: normalizedDiscount,
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

            const normalizedError = paymentError instanceof PaymentCheckoutError
                ? paymentError
                : new PaymentCheckoutError(
                    paymentError instanceof Error ? paymentError.message : "Odeme baslatilamadi.",
                );

            return NextResponse.json(
                {
                    success: false,
                    error: normalizedError.message,
                    errorCode: normalizedError.code,
                    retryable: normalizedError.retryable,
                    order,
                },
                { status: normalizedError.httpStatus },
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
