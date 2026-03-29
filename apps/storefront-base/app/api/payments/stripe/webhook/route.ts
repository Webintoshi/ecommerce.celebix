import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createPaymentWebhookEvent, getPaymentAttemptById, updatePaymentAttempt } from "@/lib/db/payment-attempts";
import { getActivePaymentGatewaysByType } from "@/lib/db/payment-gateways";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { enqueueAndProcessInvoiceForOrder } from "@/lib/db/accounting";
import { createStripeWebhookEvent, getPaymentAttemptByCheckoutToken } from "@/lib/payment-runtime";

export async function POST(request: NextRequest) {
    const payload = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
        return NextResponse.json({ success: false, error: "Stripe signature eksik." }, { status: 400 });
    }

    const gateways = (await getActivePaymentGatewaysByType("stripe")).filter((gateway) => Boolean(gateway.configuration.webhookSecret));
    let matchedGateway = null;
    let event: Stripe.Event | null = null;

    for (const gateway of gateways) {
        try {
            event = createStripeWebhookEvent(gateway, payload, signature);
            matchedGateway = gateway;
            break;
        } catch {
            continue;
        }
    }

    if (!matchedGateway || !event) {
        return NextResponse.json({ success: false, error: "Stripe webhook imzasi dogrulanamadi." }, { status: 400 });
    }

    const object = event.data.object as Stripe.Checkout.Session;
    const attemptId = object.metadata?.attemptId;
    const attempt = attemptId
        ? await getPaymentAttemptById(attemptId)
        : await getPaymentAttemptByCheckoutToken(object.id);

    await createPaymentWebhookEvent({
        provider: "stripe",
        gatewayId: matchedGateway.id,
        paymentAttemptId: attempt.id,
        orderId: attempt.order_id,
        eventType: event.type,
        status: "received",
        signature,
        payload: event as unknown as Record<string, unknown>,
        processedAt: new Date().toISOString(),
    });

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        await updatePaymentAttempt(attempt.id, {
            status: "captured",
            checkoutToken: object.id,
            providerPaymentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
            callbackPayload: event as unknown as Record<string, unknown>,
            callbackReceivedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
        });
        await updatePaymentStatus(attempt.order_id, "completed");
        await updateOrderStatus(attempt.order_id, "confirmed");
        try {
            await enqueueAndProcessInvoiceForOrder(attempt.order_id);
        } catch (accountingError) {
            console.error("Accounting queue error (stripe):", accountingError);
        }
    }

    if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
        await updatePaymentAttempt(attempt.id, {
            status: "failed",
            checkoutToken: object.id,
            providerPaymentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
            callbackPayload: event as unknown as Record<string, unknown>,
            callbackReceivedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            errorMessage: event.type === "checkout.session.expired" ? "Stripe checkout oturumu sona erdi." : "Stripe odemesi basarisiz oldu.",
        });
        await updatePaymentStatus(attempt.order_id, "failed");
        await updateOrderStatus(attempt.order_id, "cancelled");
    }

    return NextResponse.json({ received: true });
}
