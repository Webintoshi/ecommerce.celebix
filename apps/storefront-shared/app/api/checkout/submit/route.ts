import { createPublicCheckoutHandlers } from "@/lib/checkout/public-checkout.ts";
import { resolveDefaultPublicCheckoutRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

const handlers = createPublicCheckoutHandlers({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: () => resolveDefaultPublicCheckoutRuntime(),
  now: () => new Date(),
});

export const POST = handlers.submit;
