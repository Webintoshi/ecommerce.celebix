import type { PublicStorefrontContentRepository, PublicStorefrontRepository, PublicSitemapShard } from "@celebix/saas-data";
import type { PublicSeoReader } from "./public-seo-read.ts";
import { renderSitemapIndex, renderSitemapPage } from "./sitemap.ts";
import { selectTrustedStorefrontHostAuthority, type StorefrontAuthorityHeaders } from "./trusted-host-authority.ts";

type SitemapRuntime = Readonly<{
  repository: Pick<PublicStorefrontRepository, "getPublicStorefront">;
  content: Pick<PublicStorefrontContentRepository, "getSitemapIndex" | "getSitemapPage">;
  seo?: Pick<PublicSeoReader, "settings">;
}>;
type RouteInput = Readonly<{ headers: StorefrontAuthorityHeaders; source?: Readonly<Record<string, string | undefined>>; runtime: SitemapRuntime | null | undefined; now: Date }>;
const HEADERS = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" };
function response(body: string | null, status = 200) { return new Response(body, { status, headers: HEADERS }); }
function errorStatus(error: unknown) { return error !== null && typeof error === "object" && "code" in error && error.code === "not_found" ? 404 : 503; }

export function parseSitemapKeyFile(key: string): PublicSitemapShard | null {
  const match = /^sitemap-(products|content)-(0|[1-9]\d{0,3})\.xml$/.exec(key);
  return match ? { kind: match[1] as PublicSitemapShard["kind"], page: Number(match[2]) } : null;
}

async function resolveSitemap(input: RouteInput) {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime()) || !input.runtime?.seo) return { kind: "error", status: 503 } as const;
  const authority = selectTrustedStorefrontHostAuthority(input.headers, input.source ?? process.env);
  if (authority.kind !== "trusted") return { kind: "error", status: 503 } as const;
  const { hostname } = authority;
  const storefront = await input.runtime.repository.getPublicStorefront({ hostname, now: new Date(input.now) });
  if (storefront.hostname !== hostname || storefront.canonicalUrl !== `https://${storefront.primaryHostname}/`) return { kind: "error", status: 503 } as const;
  let settings;
  try { settings = await input.runtime.seo.settings({ hostname, now: new Date(input.now) }); }
  catch { return { kind: "error", status: 503 } as const; }
  const allowed = storefront.primaryHostname === hostname && settings.hostname === hostname && settings.allowIndex === true && settings.eligible === true;
  return { kind: "resolved", hostname, canonicalUrl: storefront.canonicalUrl, allowed, content: input.runtime.content } as const;
}

export async function createSitemapIndexResponse(input: RouteInput): Promise<Response> {
  try {
    const selected = await resolveSitemap(input);
    if (selected.kind === "error") return response(null, selected.status);
    if (!selected.allowed) return response(renderSitemapIndex(selected.canonicalUrl, []));
    if (!selected.content.getSitemapIndex) return response(null, 503);
    const shards = await selected.content.getSitemapIndex({ hostname: selected.hostname, now: new Date(input.now) });
    return response(renderSitemapIndex(selected.canonicalUrl, shards));
  } catch (error) { return response(null, errorStatus(error)); }
}

export async function createSitemapPageResponse(input: RouteInput & PublicSitemapShard): Promise<Response> {
  if ((input.kind !== "products" && input.kind !== "content") || !Number.isSafeInteger(input.page) || input.page < 0 || input.page >= 10_000) return response(null, 404);
  try {
    const selected = await resolveSitemap(input);
    if (selected.kind === "error") return response(null, selected.status);
    if (!selected.allowed) return response(null, 404);
    if (!selected.content.getSitemapPage) return response(null, 503);
    const entries = await selected.content.getSitemapPage({ hostname: selected.hostname, now: new Date(input.now), kind: input.kind, page: input.page });
    return response(renderSitemapPage(selected.canonicalUrl, entries));
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "invalid_input") return response(null, 404);
    return response(null, errorStatus(error));
  }
}

export function createLegacySitemapRedirect(kind: string, page: string): Response {
  const shard = parseSitemapKeyFile(`sitemap-${kind}-${page}.xml`);
  return shard
    ? new Response(null, { status: 308, headers: { Location: `/sitemap-${shard.kind}-${shard.page}.xml`, "Cache-Control": "no-store" } })
    : response(null, 404);
}
