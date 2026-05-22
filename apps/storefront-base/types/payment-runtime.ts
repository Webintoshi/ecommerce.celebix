import type {
  PaymentAttempt as PaymentAttemptCore,
  PaymentAttemptStatus,
  PaymentInitResult,
  PaymentWebhookEvent as PaymentWebhookEventCore,
} from "@celebix/payment-core";

export type { PaymentAttemptStatus, PaymentInitResult };

export interface PaymentAttempt extends Omit<PaymentAttemptCore, "order_id"> {
  order_id?: string | null;
  quick_order_link_id?: string | null;
}

export interface PaymentWebhookEvent extends Omit<PaymentWebhookEventCore, "order_id"> {
  order_id?: string | null;
  quick_order_link_id?: string | null;
}
