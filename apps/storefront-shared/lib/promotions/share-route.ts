import {
  normalizePromotionCode,
  parsePublicCheckoutQuoteV2,
} from "@celebix/saas-contracts";
import { StorefrontCommerceRepositoryError } from "@celebix/saas-data";

import type { TrustedStorefrontHostAuthority } from "../trusted-host-authority.ts";
import type { StorefrontCommerceRuntime } from "../cart/runtime.ts";
import {
  clearCouponCandidateCookie,
  readCouponCandidateCookie,
  serializeCouponCandidateCookie,
} from "./cookie.ts";

type Dependencies = Readonly<{
  selectAuthority(headers: Headers): TrustedStorefrontHostAuthority;
  resolveRuntime(): Promise<Pick<StorefrontCommerceRuntime, "quote"> | null>;
}>;

function hidden(status: number): Response {
  return new Response(null, {
    status,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function cartRedirect(cookie: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      "cache-control": "no-store",
      location: "/cart",
      "referrer-policy": "no-referrer",
      "set-cookie": cookie,
      "x-content-type-options": "nosniff",
    },
  });
}

function candidateCookie(candidates: readonly string[]): string {
  return candidates.length > 0
    ? serializeCouponCandidateCookie(candidates)
    : clearCouponCandidateCookie();
}

export function createCouponShareRoute(dependencies: Dependencies) {
  return async function GET(request: Request): Promise<Response> {
    let url: URL;
    let authority: TrustedStorefrontHostAuthority;
    try {
      url = new URL(request.url);
      authority = dependencies.selectAuthority(request.headers);
    } catch {
      return hidden(404);
    }
    if (
      authority.kind !== "trusted" ||
      request.method !== "GET" ||
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/cart/coupon" ||
      url.hash ||
      url.search.slice(1).length > 512 ||
      request.headers.has("authorization") ||
      request.headers.has("content-length") ||
      request.headers.has("content-type") ||
      request.headers.has("transfer-encoding") ||
      [...request.headers.keys()].some(
        (key) =>
          key.startsWith("x-store-") ||
          key.startsWith("x-tenant-") ||
          (key.startsWith("x-celebix-") &&
            key !== "x-celebix-storefront-proxy"),
      ) ||
      [...url.searchParams.keys()].some((key) => key !== "coupon") ||
      url.searchParams.getAll("coupon").length !== 1
    )
      return hidden(404);
    const existing = readCouponCandidateCookie(request.headers.get("cookie"));
    let candidate: string;
    try {
      candidate = normalizePromotionCode(url.searchParams.get("coupon"));
    } catch {
      return cartRedirect(candidateCookie(existing));
    }
    let selectedRuntime: Pick<StorefrontCommerceRuntime, "quote"> | null;
    try {
      selectedRuntime = await dependencies.resolveRuntime();
    } catch {
      selectedRuntime = null;
    }
    if (!selectedRuntime) return cartRedirect(candidateCookie(existing));
    const candidates = Object.freeze([
      ...existing.filter((code) => code !== candidate),
      candidate,
    ].slice(-5));
    try {
      const quote = parsePublicCheckoutQuoteV2(
        await selectedRuntime.quote(
          authority.hostname,
          request.headers.get("cookie"),
          "cart",
          undefined,
          candidates,
        ),
      );
      const retained = candidates.filter((code) =>
        !quote.rejectedPromotions.some(
          (promotion) => promotion.normalizedCode === code,
        ),
      );
      return cartRedirect(candidateCookie(retained));
    } catch (error) {
      if (
        error instanceof StorefrontCommerceRepositoryError &&
        (error.code === "not_found" || error.code === "cart_empty")
      )
        return cartRedirect(candidateCookie(candidates));
      return cartRedirect(candidateCookie(existing));
    }
  };
}
