import type { PublicSeoReader } from "./public-seo-read.ts";
import { selectTrustedStorefrontHostAuthority, type StorefrontAuthorityHeaders } from "./trusted-host-authority.ts";

type RouteInput = Readonly<{ headers: StorefrontAuthorityHeaders; source?: Readonly<Record<string, string | undefined>>; reader: PublicSeoReader | null | undefined; now: Date }>;
const DENY = "User-agent: *\nDisallow: /\n";
const RESPONSE_HEADERS = { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow" };
const PRIVATE_PATHS = ["/account", "/cart", "/checkout", "/favorites", "/search", "/api/", "/odeme/"];
function status(error: unknown): number { return error !== null && typeof error === "object" && "code" in error && error.code === "not_found" ? 404 : 503; }
function response(body: string | null, code = 200) { return new Response(body, { status: code, headers: RESPONSE_HEADERS }); }
function authority(input: RouteInput) {
  if (!(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return null;
  const value = selectTrustedStorefrontHostAuthority(input.headers, input.source ?? process.env);
  return value.kind === "trusted" ? value.hostname : null;
}
export async function createRobotsResponse(input: RouteInput): Promise<Response> {
  const hostname = authority(input);
  if (!hostname || !input.reader) return response(DENY, 503);
  try {
    const settings = await input.reader.settings({ hostname, now: new Date(input.now) });
    if (!settings.eligible || !settings.allowIndex || settings.hostname !== hostname) return response(DENY);
    return response(`User-agent: *\nAllow: /\n${PRIVATE_PATHS.map((path) => `Disallow: ${path}\n`).join("")}Sitemap: https://${hostname}/sitemap.xml\n`);
  } catch (error) { return response(DENY, status(error)); }
}
export function isIndexNowKeyFile(keyFile: string): boolean { return /^[a-f0-9]{32}\.txt$/.test(keyFile); }
export async function createIndexNowKeyResponse(input: RouteInput & Readonly<{ keyFile: string }>): Promise<Response> {
  if (!isIndexNowKeyFile(input.keyFile)) return response(null, 404);
  const key = input.keyFile.slice(0, -4);
  const hostname = authority(input);
  if (!hostname || !input.reader) return response(null, 503);
  try {
    const settings = await input.reader.settings({ hostname, now: new Date(input.now) });
    if (!settings.eligible || settings.hostname !== hostname || !settings.indexNowEnabled) return response(null, 404);
    const result = await input.reader.key({ hostname, now: new Date(input.now) });
    return result.key === key ? response(result.key) : response(null, 404);
  } catch (error) { return response(null, status(error)); }
}
