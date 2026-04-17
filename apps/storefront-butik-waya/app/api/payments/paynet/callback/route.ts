import { NextRequest, NextResponse } from "next/server";
import { createPaymentWebhookEvent, getPaymentAttemptById, updatePaymentAttempt } from "@/lib/db/payment-attempts";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { isExpectedAmount, verifyAttemptToken } from "@/lib/payment-runtime";

function parseBoolean(value: unknown) {
    if (typeof value === "boolean") {
        return value;
    }

    if (typeof value === "number") {
        return value === 1;
    }

    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "true" || normalized === "1";
    }

    return false;
}

async function parsePayload(request: NextRequest) {
    const contentType = request.headers.get("content-type") || "";
    const raw = await request.text();

    if (!raw) {
        return {};
    }

    if (contentType.includes("application/json")) {
        return JSON.parse(raw) as Record<string, unknown>;
    }

    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return Object.fromEntries(new URLSearchParams(raw).entries());
    }
}

export async function POST(request: NextRequest) {
    try {
        const attemptId = request.nextUrl.searchParams.get("attemptId") || "";
        const token = request.nextUrl.searchParams.get("token") || "";

        if (!attemptId || !token) {
            return NextResponse.json({ success: false, error: "Callback dogrulama bilgisi eksik." }, { status: 400 });
        }

        const attempt = await getPaymentAttemptById(attemptId);
        const payload = await parsePayload(request);
        const referenceNo = typeof payload.referance_no === "string"
            ? payload.referance_no
            : typeof payload.reference_no === "string"
                ? payload.reference_no
                : "";
        const amount = payload.amount ?? payload.netAmount;
        const isSuccess = parseBoolean(payload.is_succeed);
        const isValid = verifyAttemptToken(attempt, token)
            && referenceNo === attempt.id
            && isExpectedAmount(attempt.amount, amount);

        await createPaymentWebhookEvent({
            provider: "paynet",
            gatewayId: attempt.gateway_id,
            paymentAttemptId: attempt.id,
            orderId: attempt.order_id,
            eventType: "confirmation",
            status: isValid ? "received" : "invalid_signature",
            headers: Object.fromEntries(request.headers.entries()),
            payload,
            processedAt: new Date().toISOString(),
        });

        if (!isValid) {
            return NextResponse.json({ success: false, error: "Paynet callback dogrulamasi basarisiz." }, { status: 400 });
        }

        await updatePaymentAttempt(attempt.id, {
            status: isSuccess ? "captured" : "failed",
            providerPaymentId: typeof payload.order_id === "string" ? payload.order_id : null,
            providerReferenceId: referenceNo,
            callbackPayload: payload,
            callbackReceivedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            errorMessage: isSuccess ? null : "Paynet islemi basarisiz oldu.",
        });

        await updatePaymentStatus(attempt.order_id, isSuccess ? "completed" : "failed");
        await updateOrderStatus(attempt.order_id, isSuccess ? "confirmed" : "cancelled");

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Paynet callback islenemedi." },
            { status: 500 },
        );
    }
}
