import { parseOrderBumpPublicOffers, type OrderBumpPublicOffers } from "@celebix/saas-contracts";
import type { PostgresPublicOrderBumpRepository } from "@celebix/saas-data";
import { credentialDigestCandidates, readStorefrontCredentialCookie, type StorefrontCommerceCredentialKeyring } from "../cart/credential.ts";

const EMPTY = parseOrderBumpPublicOffers({ cartVersion: null, heading: null, offers: [] });
export function createOrderBumpRuntime(dependencies: Readonly<{ repository: Pick<PostgresPublicOrderBumpRepository, "offers">; keyring: StorefrontCommerceCredentialKeyring; now(): Date }>) {
  return Object.freeze({
    async offers(hostname: string, cookieHeader: string | null, placement: "side_cart" | "checkout"): Promise<OrderBumpPublicOffers> {
      const credential = readStorefrontCredentialCookie("cart", cookieHeader);
      if (credential.kind !== "present") return EMPTY;
      const credentialCandidates = credentialDigestCandidates("cart", credential.value, dependencies.keyring);
      if (!credentialCandidates.length) return EMPTY;
      return parseOrderBumpPublicOffers(await dependencies.repository.offers({ hostname, now: dependencies.now(), credentialCandidates, placement }));
    },
  });
}
export type OrderBumpRuntime = ReturnType<typeof createOrderBumpRuntime>;
