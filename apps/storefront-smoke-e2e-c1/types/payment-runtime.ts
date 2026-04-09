export type PaymentAttemptStatus =
    | "initiated"
    | "pending_action"
    | "authorized"
    | "captured"
    | "failed"
    | "cancelled"
    | "expired"
    | "refunded";

export interface PaymentAttempt {
    id: string;
    order_id: string;
    gateway_id: string;
    provider: string;
    status: PaymentAttemptStatus;
    amount: number;
    currency: string;
    idempotency_key: string;
    checkout_token?: string | null;
    redirect_url?: string | null;
    provider_payment_id?: string | null;
    provider_reference_id?: string | null;
    conversation_id?: string | null;
    customer_email?: string | null;
    customer_ip?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    request_payload: Record<string, unknown>;
    response_payload: Record<string, unknown>;
    callback_payload: Record<string, unknown>;
    callback_received_at?: string | null;
    completed_at?: string | null;
    created_at: string;
    updated_at: string;
}

export interface PaymentWebhookEvent {
    id: string;
    provider: string;
    gateway_id?: string | null;
    payment_attempt_id?: string | null;
    order_id?: string | null;
    event_type?: string | null;
    status: string;
    signature?: string | null;
    headers: Record<string, unknown>;
    payload: Record<string, unknown>;
    error_message?: string | null;
    processed_at?: string | null;
    created_at: string;
}

export interface PaymentInitResult {
    action: "redirect" | "success" | "pending";
    redirectUrl?: string;
    message?: string;
    paymentAttemptId: string;
}
