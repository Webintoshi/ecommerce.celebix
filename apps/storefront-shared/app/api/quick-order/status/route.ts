import { createPublicQuickOrderStatusRoute } from "@/lib/checkout/public-quick-link.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const GET = createPublicQuickOrderStatusRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.checkout ?? null,
});
