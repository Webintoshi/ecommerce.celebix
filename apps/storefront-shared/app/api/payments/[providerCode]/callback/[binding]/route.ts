import "server-only";

import { resolveDefaultHostedPaymentRuntime } from "@/lib/default-runtime.ts";
import { createHostedPaymentCallbackRoute } from "@/lib/payment-adapters/runtime.ts";

export const POST = createHostedPaymentCallbackRoute({
  resolveRuntime: resolveDefaultHostedPaymentRuntime,
});
