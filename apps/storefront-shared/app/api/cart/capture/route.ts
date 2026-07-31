import { randomBytes, randomUUID } from "node:crypto";

import { createCartCaptureRoute } from "@/lib/cart-capture/runtime.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createCartCaptureRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRuntime: async () => {
    const runtime = await resolveDefaultPublicStorefrontRuntime();
    return runtime === null ? null : Object.freeze({ abandonedCarts: runtime.abandonedCarts });
  },
  randomBytes,
  randomUuid: randomUUID,
  now: () => new Date(),
});
