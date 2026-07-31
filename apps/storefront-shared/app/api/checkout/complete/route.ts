import { createCheckoutCompleteRoute } from "@/lib/cart/route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createCheckoutCompleteRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.cart ?? null,
});
