import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import { createNewsletterSubscribeRoute } from "@/lib/newsletter/runtime.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const POST = createNewsletterSubscribeRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRepository: async () => (await resolveDefaultPublicStorefrontRuntime())?.newsletter ?? null,
  now: () => new Date(),
});
