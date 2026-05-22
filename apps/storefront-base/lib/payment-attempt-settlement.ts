import { enqueueAndProcessInvoiceForOrder } from "@/lib/db/accounting";
import { markQuickOrderLinkPaid, materializeOrderFromQuickOrderLink, settleQuickOrderLinkFailure } from "@/lib/db/quick-order-links";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import { shouldUseLightPostgresStorefront } from "@/lib/db/storefront-database-mode";
import type { PaymentAttempt } from "@/types/payment-runtime";

async function maybeEnqueueInvoice(orderId: string) {
  if (shouldUseLightPostgresStorefront()) {
    return;
  }

  try {
    await enqueueAndProcessInvoiceForOrder(orderId);
  } catch (accountingError) {
    console.error("Accounting queue error (order):", accountingError);
  }
}

export async function settleSuccessfulPaymentAttempt(attempt: PaymentAttempt) {
  if (attempt.quick_order_link_id) {
    if (shouldUseLightPostgresStorefront()) {
      throw new Error("Light Postgres checkout MVP hizli siparis linki settlement akisina henuz bagli degil.");
    }

    const order = await materializeOrderFromQuickOrderLink(attempt.quick_order_link_id, attempt.gateway_id);
    await updatePaymentStatus(String(order.id), "completed");
    await updateOrderStatus(String(order.id), "confirmed");
    await markQuickOrderLinkPaid(attempt.quick_order_link_id, String(order.id));

    await maybeEnqueueInvoice(String(order.id));

    return String(order.id);
  }

  if (!attempt.order_id) {
    throw new Error("Odeme denemesi bagli bir siparis icermiyor.");
  }

  await updatePaymentStatus(attempt.order_id, "completed");
  await updateOrderStatus(attempt.order_id, "confirmed");
  await maybeEnqueueInvoice(attempt.order_id);

  return attempt.order_id;
}

export async function settleFailedPaymentAttempt(attempt: PaymentAttempt) {
  if (attempt.quick_order_link_id) {
    if (shouldUseLightPostgresStorefront()) {
      throw new Error("Light Postgres checkout MVP hizli siparis linki failure settlement akisina henuz bagli degil.");
    }

    await settleQuickOrderLinkFailure(attempt.quick_order_link_id);
    return null;
  }

  if (!attempt.order_id) {
    return null;
  }

  await updatePaymentStatus(attempt.order_id, "failed");
  await updateOrderStatus(attempt.order_id, "cancelled");
  return attempt.order_id;
}
