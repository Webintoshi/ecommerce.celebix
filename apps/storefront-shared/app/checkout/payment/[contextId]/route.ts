import { randomBytes } from "node:crypto";

import { createCheckoutContextPaymentRoute } from "@/lib/checkout/checkout-context-route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createCheckoutContextPaymentRoute({
  selectAuthority: selectTrustedStorefrontHostAuthority,
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.hostedCheckout ?? null,
  nonce: () => randomBytes(24).toString("base64"),
});
