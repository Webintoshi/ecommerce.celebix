import { PublicStorefrontRepositoryError, type PublicStorefrontRepository } from "@celebix/saas-data";
import type { PublicStorefront } from "../../../packages/saas-contracts/src/storefront/index.ts";

import { selectTrustedStorefrontHostAuthority, type StorefrontAuthorityHeaders } from "./trusted-host-authority.ts";

export type PublicStorefrontRequestResult = Readonly<{ kind: "active"; storefront: PublicStorefront }> | Readonly<{ kind: "not_found" }> | Readonly<{ kind: "unavailable" }>;

export async function resolvePublicStorefrontRequest(input: Readonly<{ headers: StorefrontAuthorityHeaders; source?: Record<string, string | undefined>; repository: PublicStorefrontRepository; now: Date }>): Promise<PublicStorefrontRequestResult> {
  if (!input || !input.repository || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return Object.freeze({ kind: "unavailable" });
  const authority = selectTrustedStorefrontHostAuthority(input.headers, input.source ?? process.env);
  if (authority.kind !== "trusted") return Object.freeze({ kind: "unavailable" });
  try {
    const storefront = await input.repository.getPublicStorefront({ hostname: authority.hostname, now: new Date(input.now) });
    return Object.freeze({ kind: "active", storefront });
  } catch (error) {
    return Object.freeze({ kind: error instanceof PublicStorefrontRepositoryError && error.code === "not_found" ? "not_found" : "unavailable" });
  }
}
