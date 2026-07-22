import { createQuickOrderCheckoutRoute, resolveDefaultCheckoutPaymentRuntime } from "@/lib/checkout/runtime.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createQuickOrderCheckoutRoute({
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
