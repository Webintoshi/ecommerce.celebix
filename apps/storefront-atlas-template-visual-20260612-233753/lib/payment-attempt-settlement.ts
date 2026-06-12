import { enqueueAndProcessInvoiceForOrder } from "@/lib/db/accounting";
import { markQuickOrderLinkPaid, materializeOrderFromQuickOrderLink, settleQuickOrderLinkFailure } from "@/lib/db/quick-order-links";
import { updateOrderStatus, updatePaymentStatus } from "@/lib/db/orders";
import type { PaymentAttempt } from "@/types/payment-runtime";

export async function settleSuccessfulPaymentAttempt(attempt: PaymentAttempt) {
  if (attempt.quick_order_link_id) {
    const order = await materializeOrderFromQuickOrderLink(attempt.quick_order_link_id, attempt.gateway_id);
    await updatePaymentStatus(String(order.id), "completed");
    await updateOrderStatus(String(order.id), "confirmed");
    await markQuickOrderLinkPaid(attempt.quick_order_link_id, String(order.id));

    try {
      await enqueueAndProcessInvoiceForOrder(String(order.id));
    } catch (accountingError) {
      console.error("Accounting queue error (quick-order):", accountingError);
    }

    return String(order.id);
  }

  if (!attempt.order_id) {
    throw new Error("Odeme denemesi bagli bir siparis icermiyor.");
  }

  await updatePaymentStatus(attempt.order_id, "completed");
  await updateOrderStatus(attempt.order_id, "confirmed");

  try {
    await enqueueAndProcessInvoiceForOrder(attempt.order_id);
  } catch (accountingError) {
    console.error("Accounting queue error (order):", accountingError);
  }

  return attempt.order_id;
}

export async function settleFailedPaymentAttempt(attempt: PaymentAttempt) {
  if (attempt.quick_order_link_id) {
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
