import { createServerClient } from "@/lib/supabase";
import { PaymentAttempt, PaymentAttemptStatus, PaymentWebhookEvent } from "@/types/payment-runtime";

export async function createPaymentAttempt(input: {
    orderId: string;
    gatewayId: string;
    provider: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
    customerEmail?: string;
    customerIp?: string;
    requestPayload?: Record<string, unknown>;
}) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("payment_attempts")
        .insert({
            order_id: input.orderId,
            gateway_id: input.gatewayId,
            provider: input.provider,
            amount: input.amount,
            currency: input.currency,
            idempotency_key: input.idempotencyKey,
            customer_email: input.customerEmail ?? null,
            customer_ip: input.customerIp ?? null,
            request_payload: input.requestPayload ?? {},
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data as PaymentAttempt;
}

export async function getPaymentAttemptById(id: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("payment_attempts")
        .select("*")
        .eq("id", id)
        .single();

    if (error) {
        throw error;
    }

    return data as PaymentAttempt;
}

export async function getPaymentAttemptByToken(token: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("payment_attempts")
        .select("*")
        .eq("checkout_token", token)
        .single();

    if (error) {
        throw error;
    }

    return data as PaymentAttempt;
}

export async function getPaymentAttemptByProviderReferenceId(referenceId: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("payment_attempts")
        .select("*")
        .eq("provider_reference_id", referenceId)
        .single();

    if (error) {
        throw error;
    }

    return data as PaymentAttempt;
}

export async function updatePaymentAttempt(id: string, updates: {
    status?: PaymentAttemptStatus;
    checkoutToken?: string | null;
    redirectUrl?: string | null;
    providerPaymentId?: string | null;
    providerReferenceId?: string | null;
    conversationId?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    responsePayload?: Record<string, unknown>;
    callbackPayload?: Record<string, unknown>;
    callbackReceivedAt?: string | null;
    completedAt?: string | null;
}) {
    const serverClient = createServerClient();

    const payload = {
        ...(updates.status ? { status: updates.status } : {}),
        ...(updates.checkoutToken !== undefined ? { checkout_token: updates.checkoutToken } : {}),
        ...(updates.redirectUrl !== undefined ? { redirect_url: updates.redirectUrl } : {}),
        ...(updates.providerPaymentId !== undefined ? { provider_payment_id: updates.providerPaymentId } : {}),
        ...(updates.providerReferenceId !== undefined ? { provider_reference_id: updates.providerReferenceId } : {}),
        ...(updates.conversationId !== undefined ? { conversation_id: updates.conversationId } : {}),
        ...(updates.errorCode !== undefined ? { error_code: updates.errorCode } : {}),
        ...(updates.errorMessage !== undefined ? { error_message: updates.errorMessage } : {}),
        ...(updates.responsePayload !== undefined ? { response_payload: updates.responsePayload } : {}),
        ...(updates.callbackPayload !== undefined ? { callback_payload: updates.callbackPayload } : {}),
        ...(updates.callbackReceivedAt !== undefined ? { callback_received_at: updates.callbackReceivedAt } : {}),
        ...(updates.completedAt !== undefined ? { completed_at: updates.completedAt } : {}),
    };

    const { data, error } = await serverClient
        .from("payment_attempts")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data as PaymentAttempt;
}

export async function createPaymentWebhookEvent(input: {
    provider: string;
    gatewayId?: string;
    paymentAttemptId?: string;
    orderId?: string;
    eventType?: string;
    status?: string;
    signature?: string;
    headers?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    errorMessage?: string;
    processedAt?: string;
}) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("payment_webhook_events")
        .insert({
            provider: input.provider,
            gateway_id: input.gatewayId ?? null,
            payment_attempt_id: input.paymentAttemptId ?? null,
            order_id: input.orderId ?? null,
            event_type: input.eventType ?? null,
            status: input.status ?? "received",
            signature: input.signature ?? null,
            headers: input.headers ?? {},
            payload: input.payload ?? {},
            error_message: input.errorMessage ?? null,
            processed_at: input.processedAt ?? null,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data as PaymentWebhookEvent;
}
