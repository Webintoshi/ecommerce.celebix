import { createCartGetRoute } from "@/lib/cart/route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const GET = createCartGetRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => {
    const runtime = await resolveDefaultPublicStorefrontRuntime();
    return runtime?.cart ?? null;
  },
});
