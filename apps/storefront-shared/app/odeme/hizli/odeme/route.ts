import { createQuickOrderIframeRoute, resolveDefaultCheckoutPaymentRuntime } from "@/lib/checkout/runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const GET = createQuickOrderIframeRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: resolveDefaultCheckoutPaymentRuntime,
});
