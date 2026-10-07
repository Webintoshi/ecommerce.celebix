import { createGoogleMarketingPurchaseRoute } from "@/lib/google-marketing-runtime.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const dynamic = "force-dynamic";
export const GET = createGoogleMarketingPurchaseRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => (await resolveDefaultPublicStorefrontRuntime())?.googleMarketing ?? null,
});
