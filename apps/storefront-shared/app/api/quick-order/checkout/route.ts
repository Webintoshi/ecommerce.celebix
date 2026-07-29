import { createQuickOrderCheckoutRoute, resolveDefaultCheckoutPaymentRuntime } from "@/lib/checkout/runtime.ts";
import { createQuickOrderHostedPaymentBridgeRoute } from "@/lib/checkout/hosted-payment.ts";
import {
  resolveDefaultPublicStorefrontRuntime,
  resolveDefaultQuickOrderHostedPaymentBridgeRuntime,
} from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

const legacyPost = createQuickOrderCheckoutRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => {
    const [storefront, payment] = await Promise.all([
      resolveDefaultPublicStorefrontRuntime(),
      resolveDefaultCheckoutPaymentRuntime(),
    ]);
    return storefront === null || payment === null
      ? null
      : Object.freeze({ checkout: storefront.checkout, ...payment });
  },
});

export const POST = createQuickOrderHostedPaymentBridgeRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: () => resolveDefaultQuickOrderHostedPaymentBridgeRuntime(),
  fallback: legacyPost,
});
