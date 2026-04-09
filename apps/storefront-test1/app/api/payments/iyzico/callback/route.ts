import { NextRequest, NextResponse } from "next/server";
import { getPaymentGatewayById } from "@/lib/db/payment-gateways";
import { createPaymentWebhookEvent, updatePaymentAttempt } from "@/lib/db/payment-attempts";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { enqueueAndProcessInvoiceForOrder } from "@/lib/db/accounting";
import {
    getOrderRedirectUrl,
    getPaymentAttemptByCheckoutToken,
    getSafeAttemptStatusFromIyzico,
    retrieveIyzicoPayment,
} from "@/lib/payment-runtime";

function getBaseUrl(request: NextRequest) {
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");

    if (forwardedProto && forwardedHost) {
        return `${forwardedProto}://${forwardedHost}`;
    }

    return new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const token = formData.get("token")?.toString();

        if (!token) {
            return NextResponse.json({ success: false, error: "Token eksik." }, { status: 400 });
        }

        const attempt = await getPaymentAttemptByCheckoutToken(token);
        const gateway = await getPaymentGatewayById(attempt.gateway_id);

        if (!gateway) {
            return NextResponse.json({ success: false, error: "Gateway bulunamadi." }, { status: 404 });
        }

        const result = await retrieveIyzicoPayment(gateway, token);
        const status = getSafeAttemptStatusFromIyzico(result);
        const success = status === "captured";

        await createPaymentWebhookEvent({
            provider: "iyzico",
            gatewayId: gateway.id,
            paymentAttemptId: attempt.id,
            orderId: attempt.order_id,
            eventType: "checkout_callback",
            status: success ? "processed" : "failed",
            payload: Object.fromEntries(formData.entries()),
            processedAt: new Date().toISOString(),
        });

        await updatePaymentAttempt(attempt.id, {
            status,
            providerPaymentId: typeof result.paymentId === "string" ? result.paymentId : null,
            responsePayload: result,
            callbackPayload: Object.fromEntries(formData.entries()),
            callbackReceivedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            errorCode: success ? null : (typeof result.errorCode === "string" ? result.errorCode : null),
            errorMessage: success ? null : (typeof result.errorMessage === "string" ? result.errorMessage : "Odeme basarisiz."),
        });

        await updatePaymentStatus(attempt.order_id, success ? "completed" : "failed");
        if (success) {
            await updateOrderStatus(attempt.order_id, "confirmed");
            try {
                await enqueueAndProcessInvoiceForOrder(attempt.order_id);
            } catch (accountingError) {
                console.error("Accounting queue error (iyzico):", accountingError);
            }
        } else {
            await updateOrderStatus(attempt.order_id, "cancelled");
        }

        return NextResponse.redirect(getOrderRedirectUrl(getBaseUrl(request), attempt.order_id, success ? "success" : "failed"), 303);
    } catch (error) {
        console.error("iyzico callback error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Callback islenemedi." },
            { status: 500 },
        );
    }
}
