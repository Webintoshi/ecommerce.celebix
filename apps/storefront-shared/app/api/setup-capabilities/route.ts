import { resolveDefaultPublicStorefrontRuntime, resolveStorefrontSetupPaymentAvailability } from "@/lib/default-runtime.ts";
import { createStorefrontSetupCapabilitiesRoute } from "@/lib/setup-capabilities.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const GET = createStorefrontSetupCapabilitiesRoute({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveRepository: async () => (await resolveDefaultPublicStorefrontRuntime())?.domainHealth ?? null,
  paymentAvailability: resolveStorefrontSetupPaymentAvailability,
  now: () => new Date(),
});
