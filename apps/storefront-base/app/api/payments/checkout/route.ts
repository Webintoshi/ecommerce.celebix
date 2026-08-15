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

function normalizeIpCandidate(value: string | null) {
    const trimmed = value?.trim();
    if (!trimmed || trimmed.includes(",")) {
        return null;
    }

    return trimmed.startsWith("::ffff:") ? trimmed.slice("::ffff:".length) : trimmed;
}

function isPrivateIpv4(ip: string) {
    const parts = ip.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }

    const [first, second] = parts;

    return (
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
    );
}

function isPublicCheckoutIp(ip: string) {
    const normalized = ip.trim().toLowerCase();
    if (!normalized || normalized === "localhost" || normalized === "::1") {
        return false;
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
        return !isPrivateIpv4(normalized);
    }

    return normalized.includes(":") && !normalized.startsWith("fc") && !normalized.startsWith("fd") && !normalized.startsWith("fe80");
}

function getRequestIp(request: NextRequest) {
    const candidates = [
        request.headers.get("cf-connecting-ip"),
        request.headers.get("x-real-ip"),
        ...((request.headers.get("x-forwarded-for") ?? "").split(",")),
    ]
        .map(normalizeIpCandidate)
        .filter((candidate): candidate is string => Boolean(candidate));

    return candidates.find(isPublicCheckoutIp) ?? candidates[0] ?? "127.0.0.1";
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
