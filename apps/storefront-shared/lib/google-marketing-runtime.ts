import "server-only";
import { parsePublicGoogleMarketingProjection, type PublicGoogleMarketingProjection } from "../../../packages/saas-contracts/src/google-marketing/index.ts";
import { parseGoogleConfirmedPurchase, type GoogleConfirmedPurchase } from "./google-marketing.ts";
import { readStandardHostedCheckoutCookie, standardHostedCheckoutDigestCandidates } from "./checkout/standard-hosted-cookie.ts";
import type { StorefrontCommerceCredentialKeyring } from "./cart/credential.ts";
import type { TrustedStorefrontHostAuthority } from "./trusted-host-authority.ts";

export type PublicGoogleMarketingRuntime = Readonly<{
  projection(storeId: string): Promise<PublicGoogleMarketingProjection | null>;
  purchase(input: Readonly<{ hostname: string; cookieHeader: string | null }>): Promise<GoogleConfirmedPurchase | null>;
}>;
type Dependencies = Readonly<{ keyring: StorefrontCommerceCredentialKeyring; now(): Date;
  /** Caller executes these two public functions with the host resolver role. */
  query(text: string, values: readonly unknown[]): Promise<Readonly<{ rowCount: number | null; rows: readonly Record<string, unknown>[] }>> }>;
export function createPublicGoogleMarketingRuntime(dependencies: Dependencies): PublicGoogleMarketingRuntime {
  return Object.freeze({
    async projection(storeId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(storeId)) return null;
      try {
        const result = await dependencies.query("SELECT saas.public_google_marketing_projection($1::uuid) AS result_payload", [storeId]);
        return result.rowCount === 1 && result.rows.length === 1 ? parsePublicGoogleMarketingProjection(result.rows[0]?.result_payload) : null;
      } catch { return null; }
    },
    async purchase(input) {
      if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(input.hostname)) return null;
      const cookie = readStandardHostedCheckoutCookie(input.cookieHeader); if (cookie.kind !== "present") return null;
      try {
        const now = dependencies.now(); if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
        const candidates = standardHostedCheckoutDigestCandidates(cookie.value, dependencies.keyring); if (!candidates.length) return null;
        const result = await dependencies.query("SELECT outcome,result_payload FROM saas.public_google_marketing_purchase($1::text,$2::timestamptz,$3::jsonb)", [input.hostname, new Date(now), JSON.stringify(candidates)]);
        if (result.rowCount !== 1 || result.rows.length !== 1 || result.rows[0]?.outcome !== "found") return null;
        return parseGoogleConfirmedPurchase(result.rows[0]?.result_payload);
      } catch { return null; }
    },
  });
}
export function createGoogleMarketingPurchaseRoute(dependencies: Readonly<{ selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Pick<PublicGoogleMarketingRuntime, "purchase"> | null> }>) {
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
    try {
      const url = new URL(request.url), authority = dependencies.selectAuthority(request.headers);
      if (authority.kind !== "trusted") return json({ code: "unavailable" }, 503);
      if (request.method !== "GET" || url.pathname !== "/api/marketing/google/purchase" || url.search || url.hash) return json({ code: "invalid_input" }, 400);
      const origin = request.headers.get("origin"), fetchSite = request.headers.get("sec-fetch-site");
      if (origin !== null && origin !== `https://${authority.hostname}` || fetchSite === "cross-site" || fetchSite === "same-site") return json({ code: "forbidden" }, 403);
      const runtime = await dependencies.resolveRuntime();
      return json({ purchase: runtime ? await runtime.purchase({ hostname: authority.hostname, cookieHeader: request.headers.get("cookie") }) : null });
    } catch { return json({ code: "unavailable" }, 503); }
  };
}
