import { createPaytrCallbackRoute, resolveDefaultCheckoutPaymentRuntime } from "@/lib/checkout/runtime.ts";
import { resolveDefaultHostedPaymentRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createPaytrCallbackRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: resolveDefaultCheckoutPaymentRuntime,
  resolveHostedRuntime: resolveDefaultHostedPaymentRuntime,
});
