import type { PublicStorefront } from "@celebix/saas-contracts";
import type { CampaignHomeProjection, PublicStorefrontRepository } from "@celebix/saas-data";

export type CampaignPageProjectionResolution =
  | Readonly<{ kind: "legacy" }>
  | Readonly<{ kind: "campaign"; projection: CampaignHomeProjection }>
  | Readonly<{ kind: "unavailable" }>;

export async function resolveCampaignPageProjection(input: Readonly<{
  storefront: PublicStorefront;
  repository: PublicStorefrontRepository;
  now: Date;
}>): Promise<CampaignPageProjectionResolution> {
  if (input.storefront.presentation.schemaVersion !== 2) return Object.freeze({ kind: "legacy" });
  if (!input.repository.resolveCampaignHome) return Object.freeze({ kind: "unavailable" });
  try {
    const projection = await input.repository.resolveCampaignHome({ storefront: input.storefront, now: new Date(input.now) });
    return projection ? Object.freeze({ kind: "campaign", projection }) : Object.freeze({ kind: "unavailable" });
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
}
