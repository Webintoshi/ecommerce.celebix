import { createHash, randomBytes as secureRandomBytes, randomUUID as secureRandomUUID } from "node:crypto";
import type { QuickOrderPublicQuote } from "../../../../packages/saas-contracts/src/quick-orders/index.ts";

import type { CheckoutRuntime } from "./runtime.ts";
import {
  digestRedemptionCredential,
  generateRedemptionCredential,
  parseRedemptionCookie,
  serializeRedemptionCookie,
} from "./redemption-cookie.ts";

const TOKEN_BYTES = 32;
const REDEMPTION_SECONDS = 15 * 60;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const PRIVATE_HEADERS = Object.freeze(["authorization", "content-length", "content-type", "transfer-encoding"]);

export type PublicQuickOrderClaimResult =
  | Readonly<{ kind: "claimed"; status: 303; location: "/odeme/hizli"; setCookie: string; quote: QuickOrderPublicQuote }>
  | Readonly<{ kind: "canonical_redirect"; status: 308; location: string }>
  | Readonly<{ kind: "denied"; status: 404 }>
  | Readonly<{ kind: "unavailable"; status: 503 }>;

export type PublicQuickOrderResolution =
  | Readonly<{ kind: "active"; quote: QuickOrderPublicQuote }>
  | Readonly<{ kind: "denied" }>
  | Readonly<{ kind: "unavailable" }>;

function canonicalHostname(value: unknown): value is string {
  return typeof value === "string" && value.length <= 253 && value === value.trim() &&
    value === value.toLowerCase() && HOSTNAME.test(value);
}

function canonicalToken(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  const bytes = Buffer.from(value, "base64url");
  return bytes.byteLength === TOKEN_BYTES && bytes.toString("base64url") === value;
}

function tokenDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function requestToken(request: Request): string | null {
  if (request.method !== "GET") return null;
  let url: URL;
  try { url = new URL(request.url); } catch { return null; }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) return null;
  for (const name of PRIVATE_HEADERS) if (request.headers.has(name)) return null;
  for (const name of request.headers.keys()) if (name.toLowerCase().startsWith("x-celebix-") && name.toLowerCase() !== "x-celebix-storefront-proxy") return null;
  const prefix = "/odeme/hizli/";
  if (!url.pathname.startsWith(prefix)) return null;
  const token = url.pathname.slice(prefix.length);
  return !token.includes("/") && canonicalToken(token) && url.pathname === `${prefix}${token}` ? token : null;
}

function safePrimaryHostname(value: unknown): string | null {
  return canonicalHostname(value) ? value : null;
}

export async function processPublicQuickOrderTokenRequest(input: Readonly<{
  request: Request;
  trustedHostname: string;
  now: Date;
  runtime: CheckoutRuntime;
  routeToken?: string;
  randomBytes?: (size: number) => Uint8Array;
  randomUUID?: () => `${string}-${string}-${string}-${string}-${string}` | string;
}>): Promise<PublicQuickOrderClaimResult> {
  if (!canonicalHostname(input.trustedHostname) || !validDate(input.now)) return Object.freeze({ kind: "denied", status: 404 });
  const token = requestToken(input.request);
  if (token === null || (input.routeToken !== undefined && input.routeToken !== token) ||
      parseRedemptionCookie(input.request.headers.get("cookie")).kind === "invalid") {
    return Object.freeze({ kind: "denied", status: 404 });
  }
  let storefront;
  try {
    storefront = await input.runtime.storefrontRepository.getPublicStorefront({ hostname: input.trustedHostname, now: new Date(input.now) });
  } catch {
    return Object.freeze({ kind: "denied", status: 404 });
  }
  if (storefront.hostname !== input.trustedHostname) return Object.freeze({ kind: "unavailable", status: 503 });
  const primaryHostname = safePrimaryHostname(storefront.primaryHostname);
  if (primaryHostname === null) return Object.freeze({ kind: "unavailable", status: 503 });
  if (primaryHostname !== input.trustedHostname) {
    return Object.freeze({
      kind: "canonical_redirect",
      status: 308,
      location: `https://${primaryHostname}/odeme/hizli/${token}`,
    });
  }
  const credential = generateRedemptionCredential(input.randomBytes ?? secureRandomBytes);
  const expiresAt = new Date(input.now.getTime() + REDEMPTION_SECONDS * 1000);
  try {
    const quote = await input.runtime.quickOrderRepository.claimRedemption({
      hostname: input.trustedHostname,
      tokenDigest: tokenDigest(token),
      redemptionId: (input.randomUUID ?? secureRandomUUID)(),
      redemptionDigest: digestRedemptionCredential(credential),
      now: new Date(input.now),
      expiresAt,
    });
    const linkRemaining = Math.floor((new Date(quote.expiresAt).getTime() - input.now.getTime()) / 1000);
    const maxAge = Math.min(REDEMPTION_SECONDS, linkRemaining);
    if (!Number.isSafeInteger(maxAge) || maxAge < 1) return Object.freeze({ kind: "unavailable", status: 503 });
    return Object.freeze({
      kind: "claimed",
      status: 303,
      location: "/odeme/hizli",
      setCookie: serializeRedemptionCookie(credential, maxAge),
      quote,
    });
  } catch {
    return Object.freeze({ kind: "denied", status: 404 });
  }
}

export async function resolvePublicQuickOrder(input: Readonly<{
  trustedHostname: string;
  cookieHeader: string | null;
  now: Date;
  runtime: CheckoutRuntime;
}>): Promise<PublicQuickOrderResolution> {
  if (!canonicalHostname(input.trustedHostname) || !validDate(input.now)) return Object.freeze({ kind: "denied" });
  const cookie = parseRedemptionCookie(input.cookieHeader);
  if (cookie.kind !== "valid") return Object.freeze({ kind: "denied" });
  try {
    const quote = await input.runtime.quickOrderRepository.resolveRedemption({
      hostname: input.trustedHostname,
      redemptionDigest: digestRedemptionCredential(cookie.credential),
      now: new Date(input.now),
    });
    return Object.freeze({ kind: "active", quote });
  } catch {
    return Object.freeze({ kind: "denied" });
  }
}
