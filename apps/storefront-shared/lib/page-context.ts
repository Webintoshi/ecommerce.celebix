import "server-only";
import { cache } from "react";
import { headers } from "next/headers";

import { resolveDefaultPublicStorefrontRuntime, type PublicStorefrontRuntime } from "./default-runtime.ts";
import { resolvePublicStorefrontRequest } from "./public-storefront.ts";

export type StorefrontPageContext = Readonly<{ runtime: PublicStorefrontRuntime; storefront: Extract<Awaited<ReturnType<typeof resolvePublicStorefrontRequest>>, { kind: "active" }>["storefront"] }>;
export type StorefrontPageResolution = Readonly<{ kind: "active"; context: StorefrontPageContext }> | Readonly<{ kind: "not_found" }> | Readonly<{ kind: "unavailable" }>;

export const resolveStorefrontPage = cache(async (): Promise<StorefrontPageResolution> => {
  const runtime = await resolveDefaultPublicStorefrontRuntime();
  if (runtime === null) return Object.freeze({ kind: "unavailable" });
  const selected = await resolvePublicStorefrontRequest({ headers: await headers(), repository: runtime.repository, now: new Date() });
  return selected.kind === "active" ? Object.freeze({ kind: "active", context: Object.freeze({ runtime, storefront: selected.storefront }) }) : selected;
});
