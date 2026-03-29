import { NextRequest, NextResponse } from "next/server";
import { getPaymentGatewayById } from "@/lib/db/payment-gateways";
import {
    createPaymentWebhookEvent,
    getPaymentAttemptByProviderReferenceId,
    updatePaymentAttempt,
} from "@/lib/db/payment-attempts";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { enqueueAndProcessInvoiceForOrder } from "@/lib/db/accounting";
import { verifyPaytrCallback } from "@/lib/payment-runtime";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const merchantOid = formData.get("merchant_oid")?.toString() || "";
        const status = formData.get("status")?.toString() || "failed";
        const totalAmount = formData.get("total_amount")?.toString() || "0";
        const receivedHash = formData.get("hash")?.toString() || "";
        const failedReasonCode = formData.get("failed_reason_code")?.toString() || null;
        const failedReasonMsg = formData.get("failed_reason_msg")?.toString() || null;

        if (!merchantOid || !receivedHash) {
            return new NextResponse("missing", { status: 400 });
        }

        const attempt = await getPaymentAttemptByProviderReferenceId(merchantOid);
        const gateway = await getPaymentGatewayById(attempt.gateway_id);

        if (!gateway) {
            return new NextResponse("missing_gateway", { status: 404 });
        }

        const isValid = verifyPaytrCallback({
            merchantOid,
            status,
            totalAmount,
            receivedHash,
            gateway,
        });

        await createPaymentWebhookEvent({
            provider: "paytr",
            gatewayId: gateway.id,
            paymentAttemptId: attempt.id,
            orderId: attempt.order_id,
            eventType: "callback",
            status: isValid ? "received" : "invalid_signature",
            signature: receivedHash,
            payload: Object.fromEntries(formData.entries()),
            processedAt: new Date().toISOString(),
        });

        if (!isValid) {
            return new NextResponse("invalid", { status: 400 });
        }

        const success = status === "success";

        await updatePaymentAttempt(attempt.id, {
            status: success ? "captured" : "failed",
            callbackPayload: Object.fromEntries(formData.entries()),
            callbackReceivedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            errorCode: success ? null : failedReasonCode,
            errorMessage: success ? null : failedReasonMsg,
        });

        await updatePaymentStatus(attempt.order_id, success ? "completed" : "failed");
        if (success) {
            await updateOrderStatus(attempt.order_id, "confirmed");
            try {
                await enqueueAndProcessInvoiceForOrder(attempt.order_id);
            } catch (accountingError) {
                console.error("Accounting queue error (paytr):", accountingError);
            }
        } else {
            await updateOrderStatus(attempt.order_id, "cancelled");
        }

        return new NextResponse("OK", {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
            },
        });
    } catch (error) {
        console.error("PAYTR callback error:", error);
        return new NextResponse("error", { status: 500 });
    }
}
