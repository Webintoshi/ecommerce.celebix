import { createCartRecoveryRoute } from "@/lib/cart/route.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const dynamic = "force-dynamic";
export const POST = createCartRecoveryRoute({
  selectAuthority: selectTrustedStorefrontHostAuthority,
  async resolveRuntime() { return (await resolveDefaultPublicStorefrontRuntime())?.cart ?? null; },
});
