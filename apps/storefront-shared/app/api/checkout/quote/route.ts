import { createCheckoutQuoteRoute } from "@/lib/cart/route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createCheckoutQuoteRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  warmPromotions: async (hostname) => { await (await resolveDefaultPublicStorefrontRuntime())?.warmPromotions(hostname); },
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.cart ?? null,
});
