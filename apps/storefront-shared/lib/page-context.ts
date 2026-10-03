import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { PublicStorefrontDesign, ContactWidgetConfig } from "@celebix/saas-contracts";
import type { CampaignHomeProjection } from "@celebix/saas-data";

import { resolveDefaultPublicStorefrontRuntime, type PublicStorefrontRuntime } from "./default-runtime.ts";
import { resolveCampaignPageProjection, withCampaignPresentation } from "./campaign-page-resolution.ts";
import { resolvePublicStorefrontRequest } from "./public-storefront.ts";

export type StorefrontTrackerContext = Readonly<{ websiteId: string; hostname: string; trackerScriptUrl: string; collectorOrigin: string }>;
export type StorefrontPageContext = Readonly<{
  runtime: PublicStorefrontRuntime;
  storefront: Extract<Awaited<ReturnType<typeof resolvePublicStorefrontRequest>>, { kind: "active" }>["storefront"];
  campaign: CampaignHomeProjection | null;
  design: PublicStorefrontDesign;
  tracker: StorefrontTrackerContext | null;
  contactWidget: ContactWidgetConfig | null;
}>;
export type StorefrontPageResolution = Readonly<{ kind: "active"; context: StorefrontPageContext }> | Readonly<{ kind: "not_found" }> | Readonly<{ kind: "unavailable" }>;

export const resolveStorefrontPage = cache(async (): Promise<StorefrontPageResolution> => {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (runtime === null) return Object.freeze({ kind: "unavailable" });
  const now = new Date();
  const selected = await resolvePublicStorefrontRequest({ headers: await headers(), repository: runtime.repository, now });
  if (selected.kind !== "active") return selected;
  const [campaignResolution, design, tracker, widget] = await Promise.all([
    resolveCampaignPageProjection({ storefront: selected.storefront, repository: runtime.repository, now, includeProductRows: false }),
    runtime.repository.getPublicStorefrontDesign({ storefront: selected.storefront, now }).catch(() => null),
    resolveStorefrontTracker(runtime, selected.storefront.hostname, now).catch(() => null),
    runtime.contactWidgets?.getForHost({ hostname: selected.storefront.hostname, now }).catch(() => null) ?? null,
  ]);
  if (campaignResolution.kind === "unavailable") return Object.freeze({ kind: "unavailable" });
  if (design === null) return Object.freeze({ kind: "unavailable" });
  const campaign = campaignResolution.kind === "campaign" ? campaignResolution.projection : null;
  const storefront = campaign ? withCampaignPresentation(selected.storefront, campaign) : selected.storefront;
  const contactWidget = widget?.storeId === storefront.id ? widget.config : null;
  return Object.freeze({ kind: "active", context: Object.freeze({ runtime, storefront, campaign, design, tracker, contactWidget }) });
});

// Product rows belong to the homepage. The shared shell remains request-deduplicated.
export const resolveStorefrontHomePage = cache(async (): Promise<StorefrontPageResolution> => {
  const selected = await resolveStorefrontPage();
  if (selected.kind !== "active") return selected;
  const { runtime, storefront } = selected.context;
  const campaign = await resolveCampaignPageProjection({ storefront, repository: runtime.repository, now: new Date() });
  if (campaign.kind === "unavailable") return Object.freeze({ kind: "unavailable" });
  if (campaign.kind === "legacy") return selected;
  return Object.freeze({ kind: "active", context: Object.freeze({ ...selected.context,
    campaign: campaign.projection, storefront: withCampaignPresentation(storefront, campaign.projection) }) });
});

export async function resolveStorefrontTracker(runtime: PublicStorefrontRuntime, hostname: string, now: Date): Promise<StorefrontTrackerContext | null> {
  if (!runtime.analyticsCollector || !runtime.analytics) return null;
  const result = await runtime.analytics.getTrackerConfig({ hostname, now: new Date(now) });
  return result === null ? null : Object.freeze({ ...result, trackerScriptUrl: runtime.analyticsCollector.trackerScriptUrl, collectorOrigin: runtime.analyticsCollector.collectorOrigin });
}
