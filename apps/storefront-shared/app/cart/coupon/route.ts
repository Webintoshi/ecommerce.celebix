import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { createCouponShareRoute } from "@/lib/promotions/share-route.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const GET = createCouponShareRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () =>
    (await resolveDefaultPublicStorefrontRuntime())?.cart ?? null,
});
