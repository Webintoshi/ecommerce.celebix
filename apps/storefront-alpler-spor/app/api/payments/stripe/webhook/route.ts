import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createPaymentWebhookEvent, getPaymentAttemptById, updatePaymentAttempt } from "@/lib/db/payment-attempts";
import { getActivePaymentGatewaysByType } from "@/lib/db/payment-gateways";
import { createStripeWebhookEvent, getPaymentAttemptByCheckoutToken } from "@/lib/payment-runtime";
import { settleFailedPaymentAttempt, settleSuccessfulPaymentAttempt } from "@/lib/payment-attempt-settlement";

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
        orderId: attempt.order_id ?? undefined,
        quickOrderLinkId: attempt.quick_order_link_id ?? undefined,
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
        await settleSuccessfulPaymentAttempt(attempt);
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
        await settleFailedPaymentAttempt(attempt);
    }

    return NextResponse.json({ received: true });
}
