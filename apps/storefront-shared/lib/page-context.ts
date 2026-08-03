import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { PublicStorefrontDesign } from "@celebix/saas-contracts";

import { resolveDefaultPublicStorefrontRuntime, type PublicStorefrontRuntime } from "./default-runtime.ts";
import { resolvePublicStorefrontRequest } from "./public-storefront.ts";

export type StorefrontTrackerContext = Readonly<{ websiteId: string; hostname: string; trackerScriptUrl: string; collectorOrigin: string }>;
export type StorefrontPageContext = Readonly<{
  runtime: PublicStorefrontRuntime;
  storefront: Extract<Awaited<ReturnType<typeof resolvePublicStorefrontRequest>>, { kind: "active" }>["storefront"];
  design: PublicStorefrontDesign;
  tracker: StorefrontTrackerContext | null;
}>;
export type StorefrontPageResolution = Readonly<{ kind: "active"; context: StorefrontPageContext }> | Readonly<{ kind: "not_found" }> | Readonly<{ kind: "unavailable" }>;

export const resolveStorefrontPage = cache(async (): Promise<StorefrontPageResolution> => {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (runtime === null) return Object.freeze({ kind: "unavailable" });
  const now = new Date();
  const selected = await resolvePublicStorefrontRequest({ headers: await headers(), repository: runtime.repository, now });
  if (selected.kind !== "active") return selected;
  const [design, tracker] = await Promise.all([
    runtime.repository.getPublicStorefrontDesign({ storefront: selected.storefront, now }).catch(() => null),
    resolveStorefrontTracker(runtime, selected.storefront.hostname, now).catch(() => null),
  ]);
  if (design === null) return Object.freeze({ kind: "unavailable" });
  return Object.freeze({ kind: "active", context: Object.freeze({ runtime, storefront: selected.storefront, design, tracker }) });
});

export async function resolveStorefrontTracker(runtime: PublicStorefrontRuntime, hostname: string, now: Date): Promise<StorefrontTrackerContext | null> {
  if (!runtime.analyticsCollector || !runtime.analytics) return null;
  const result = await runtime.analytics.getTrackerConfig({ hostname, now: new Date(now) });
  return result === null ? null : Object.freeze({ ...result, trackerScriptUrl: runtime.analyticsCollector.trackerScriptUrl, collectorOrigin: runtime.analyticsCollector.collectorOrigin });
}
