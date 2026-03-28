import { NextRequest, NextResponse } from "next/server";
import { createPaymentWebhookEvent, updatePaymentAttempt } from "@/lib/db/payment-attempts";
import { getPaymentGatewayById } from "@/lib/db/payment-gateways";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import {
    getOrderRedirectUrl,
    getPaymentAttemptByCheckoutToken,
    getSafeAttemptStatusFromCraftgate,
    isExpectedAmount,
    retrieveCraftgateCheckoutPayment,
} from "@/lib/payment-runtime";

function getBaseUrl(request: NextRequest) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");

    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }

    return new URL(request.url).origin;
}

async function extractToken(request: NextRequest) {
    const queryToken = request.nextUrl.searchParams.get("token");
    if (queryToken) {
        return queryToken;
    }

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        return formData.get("token")?.toString() || "";
    }

    if (contentType.includes("application/json")) {
        const payload = await request.json() as Record<string, unknown>;
        return typeof payload.token === "string" ? payload.token : "";
    }

    const body = await request.text();
    if (!body) {
        return "";
    }

    try {
        const payload = JSON.parse(body) as Record<string, unknown>;
        return typeof payload.token === "string" ? payload.token : "";
    } catch {
        return new URLSearchParams(body).get("token") || "";
    }
}

async function handleCallback(request: NextRequest) {
    const token = await extractToken(request);

    if (!token) {
        return { error: "Craftgate token eksik.", status: 400 as const };
    }

    const attempt = await getPaymentAttemptByCheckoutToken(token);
    const gateway = await getPaymentGatewayById(attempt.gateway_id);

    if (!gateway) {
        return { error: "Craftgate gateway bulunamadi.", status: 404 as const };
    }

    const payment = await retrieveCraftgateCheckoutPayment(gateway, token);
    const paymentStatus = getSafeAttemptStatusFromCraftgate(payment);
    const orderNumber = typeof attempt.request_payload.orderNumber === "string" ? attempt.request_payload.orderNumber : "";
    const isValid = typeof payment.conversationId === "string"
        && payment.conversationId === attempt.id
        && typeof payment.orderId === "string"
        && payment.orderId === orderNumber
        && isExpectedAmount(attempt.amount, payment.paidPrice ?? payment.price);

    await createPaymentWebhookEvent({
        provider: "craftgate",
        gatewayId: gateway.id,
        paymentAttemptId: attempt.id,
        orderId: attempt.order_id,
        eventType: "callback",
        status: isValid ? "received" : "invalid_signature",
        headers: Object.fromEntries(request.headers.entries()),
        payload: payment,
        processedAt: new Date().toISOString(),
        errorMessage: isValid ? undefined : "Craftgate callback verisi dogrulanamadi.",
    });

    if (!isValid) {
        return { error: "Craftgate callback dogrulamasi basarisiz.", status: 400 as const };
    }

    await updatePaymentAttempt(attempt.id, {
        status: paymentStatus,
        providerPaymentId: typeof payment.id === "number" ? payment.id.toString() : null,
        providerReferenceId: typeof payment.hostReference === "string" ? payment.hostReference : null,
        conversationId: typeof payment.conversationId === "string" ? payment.conversationId : null,
        callbackPayload: payment,
        callbackReceivedAt: new Date().toISOString(),
        completedAt: paymentStatus === "captured" || paymentStatus === "failed" ? new Date().toISOString() : null,
        errorMessage: paymentStatus === "failed"
            ? (typeof payment.paymentError === "object" && payment.paymentError && "errorDescription" in payment.paymentError
                ? String(payment.paymentError.errorDescription)
                : "Craftgate odemesi basarisiz oldu.")
            : null,
    });

    if (paymentStatus === "captured") {
        await updatePaymentStatus(attempt.order_id, "completed");
        await updateOrderStatus(attempt.order_id, "confirmed");
    } else if (paymentStatus === "failed") {
        await updatePaymentStatus(attempt.order_id, "failed");
        await updateOrderStatus(attempt.order_id, "cancelled");
    }

    const redirectStatus = paymentStatus === "captured" ? "success" : paymentStatus === "failed" ? "failed" : "pending";
    return { attemptId: attempt.id, orderId: attempt.order_id, redirectStatus, status: 200 as const };
}

export async function GET(request: NextRequest) {
    const result = await handleCallback(request);

    if ("error" in result) {
        return NextResponse.redirect(`${getBaseUrl(request)}/odeme`, 302);
    }

    return NextResponse.redirect(getOrderRedirectUrl(getBaseUrl(request), result.orderId, result.redirectStatus), 302);
}

export async function POST(request: NextRequest) {
    const result = await handleCallback(request);

    if ("error" in result) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    return NextResponse.redirect(getOrderRedirectUrl(getBaseUrl(request), result.orderId, result.redirectStatus), 302);
}
