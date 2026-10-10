import { createCheckoutQuoteRoute } from "@/lib/cart/route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createCheckoutQuoteRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  warmPromotions: async (hostname) => { await (await resolveDefaultPublicStorefrontRuntime())?.warmPromotions(hostname); },
  resolveWheelPendingCoupon: async (hostname, cookie) => (await resolveDefaultPublicStorefrontRuntime())?.luckyWheel?.pendingCoupon(hostname, cookie) ?? null,
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.cart ?? null,
});
