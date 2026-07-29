import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";

import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "./lib/runtime-config.ts";
import { resolveDefaultCheckoutPaymentRuntime } from "./lib/checkout/runtime.ts";
import { digestRedemptionCredential, parseRedemptionCookie } from "./lib/checkout/redemption-cookie.ts";
import { checkoutRolloutAllowsHost } from "./lib/checkout/rollout-gate.ts";
import { selectTrustedStorefrontHostAuthority } from "./lib/trusted-host-authority.ts";

const FALLBACK_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";
const PAYTR_IFRAME_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; frame-src https://www.paytr.com";
const SECURITY_HEADERS = Object.freeze({ "cache-control": "private, no-store", "referrer-policy": "strict-origin-when-cross-origin", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains" });
const CHECKOUT_SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
});

function isCheckoutPath(pathname: string): boolean {
  return pathname === "/odeme"
    || pathname.startsWith("/odeme/")
    || pathname === "/api/checkout"
    || pathname.startsWith("/api/checkout/");
}

function isCheckoutRolloutInitiationPath(pathname: string): boolean {
  return pathname === "/odeme"
    || pathname === "/api/checkout/quote"
    || pathname === "/api/checkout/delivery"
    || pathname === "/api/checkout/submit";
}

function isProductDetailPath(pathname: string): boolean {
  if (!pathname.startsWith("/products/")) return false;
  const slug = pathname.slice("/products/".length);
  return slug.length > 0 && !slug.includes("/");
}

function unavailable(checkoutPath = false): NextResponse {
  return new NextResponse("Storefront unavailable", {
    status: 503,
    headers: {
      ...SECURITY_HEADERS,
      ...(checkoutPath ? CHECKOUT_SECURITY_HEADERS : {}),
      "content-security-policy": FALLBACK_CSP,
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

type ProxyAuthority = ReturnType<typeof selectTrustedStorefrontHostAuthority>;
type StorefrontProxyDependencies = Readonly<{
  selectAuthority: (headers: Headers) => ProxyAuthority;
  resolveMediaOrigin: () => string;
  authorizePaytrIframe: (input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>) => Promise<boolean>;
  checkoutRolloutAllows?: (hostname: string) => boolean;
  now: () => Date;
  resolveAnalytics?: (input: Readonly<{hostname:string;now:Date}>) => Promise<Readonly<{scriptOrigin:string;collectorOrigin:string}>|null>;
}>;

async function defaultIframeAuthorization(input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>): Promise<boolean> {
  const cookie = parseRedemptionCookie(input.cookieHeader);
  if (cookie.kind !== "valid" || !(input.now instanceof Date) || !Number.isFinite(input.now.getTime())) return false;
  const runtime = await resolveDefaultCheckoutPaymentRuntime();
  if (runtime === null) return false;
  try {
    await runtime.paymentRepository.getPaymentPresentation({ hostname: input.hostname,
      redemptionDigest: digestRedemptionCredential(cookie.credential), now: new Date(input.now) });
    return true;
  } catch { return false; }
}

function defaultMediaOrigin(): string {
  const snapshot = Object.fromEntries(STOREFRONT_DATA_ENVIRONMENT_FIELDS.map((name) => [name, process.env[name]]));
  return parseStorefrontDataConfig(snapshot).mediaOrigin;
}

const DEFAULT_DEPENDENCIES: StorefrontProxyDependencies = Object.freeze({
  selectAuthority: (headers) => selectTrustedStorefrontHostAuthority(headers),
  resolveMediaOrigin: defaultMediaOrigin,
  authorizePaytrIframe: defaultIframeAuthorization,
  checkoutRolloutAllows: (hostname) => checkoutRolloutAllowsHost(process.env, hostname),
  now: () => new Date(),
  async resolveAnalytics(input) {
    const { resolveDefaultPublicStorefrontRuntime } = await import("./lib/default-runtime.ts");
    const runtime = await resolveDefaultPublicStorefrontRuntime();
    if (!runtime?.analyticsCollector || !runtime.analytics) return null;
    const tracker = await runtime.analytics.getTrackerConfig({ hostname: input.hostname, now: new Date(input.now) });
    return tracker ? Object.freeze({ scriptOrigin: new URL(runtime.analyticsCollector.trackerScriptUrl).origin, collectorOrigin: runtime.analyticsCollector.collectorOrigin }) : null;
  },
});

export function createStorefrontProxy(dependencies: StorefrontProxyDependencies) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const pathname = request.nextUrl.pathname;
    const checkoutPath = isCheckoutPath(pathname);
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted") return unavailable(checkoutPath);
    if (isCheckoutRolloutInitiationPath(pathname)) {
      let rolloutAllowed = false;
      try {
        rolloutAllowed = dependencies.checkoutRolloutAllows?.(authority.hostname) === true;
      } catch {
        rolloutAllowed = false;
      }
      if (!rolloutAllowed) return unavailable(true);
    }
    const exactTarget = request.nextUrl.search === "" && request.nextUrl.hash === "";
    const callbackPath = pathname === "/api/payments/paytr/callback";
    if (callbackPath && exactTarget && request.method === "POST") {
      const callback = NextResponse.next();
      callback.headers.set("content-security-policy", FALLBACK_CSP);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) callback.headers.set(name, value);
      return callback;
    }
    if (callbackPath || pathname.startsWith("/api/payments/paytr/callback/")) return unavailable();
    let mediaOrigin: string;
    try {
      mediaOrigin = dependencies.resolveMediaOrigin();
    } catch { return unavailable(checkoutPath); }
    const nonce = randomBytes(18).toString("base64");
    const requestHeaders = new Headers(request.headers); requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    let analytics:Readonly<{scriptOrigin:string;collectorOrigin:string}>|null=null;
    if(dependencies.resolveAnalytics){try{analytics=await dependencies.resolveAnalytics({hostname:authority.hostname,now:dependencies.now()})}catch{analytics=null}}
    const scriptDestination=analytics?` ${analytics.scriptOrigin}`:"";
    const checkoutHtmlPath=pathname==="/odeme"||pathname==="/odeme/sonuc";
    const sameOriginConnectPath=checkoutHtmlPath||isProductDetailPath(pathname);
    const connectDestination=sameOriginConnectPath
      ? analytics?`'self' ${analytics.collectorOrigin}`:"'self'"
      : analytics?.collectorOrigin??"'none'";
    const defaultCsp = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${scriptDestination}; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${mediaOrigin}; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; connect-src ${connectDestination}`;
    let iframeAuthorized = false;
    if (exactTarget && pathname === "/odeme/hizli/odeme") {
      try {
        iframeAuthorized = await dependencies.authorizePaytrIframe({ hostname: authority.hostname,
          cookieHeader: request.headers.get("cookie"), now: dependencies.now() }) === true;
      } catch { iframeAuthorized = false; }
    }
    const csp = exactTarget && (pathname === "/odeme" || pathname === "/odeme/hizli")
      ? `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${scriptDestination}; style-src 'self' 'unsafe-inline'; img-src 'self' data: ${mediaOrigin}; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action https://${authority.hostname}; object-src 'none'; connect-src ${connectDestination}`
      : iframeAuthorized
        ? PAYTR_IFRAME_CSP
        : defaultCsp;
    response.headers.set("content-security-policy", csp);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    if (checkoutPath) {
      for (const [name, value] of Object.entries(CHECKOUT_SECURITY_HEADERS)) {
        response.headers.set(name, value);
      }
    }
    return response;
  };
}

const defaultProxy = createStorefrontProxy(DEFAULT_DEPENDENCIES);
export function proxy(request: NextRequest): Promise<NextResponse> { return defaultProxy(request); }

export const config = { matcher: ["/((?!health|_next/static|_next/image|favicon.ico).*)"] };
