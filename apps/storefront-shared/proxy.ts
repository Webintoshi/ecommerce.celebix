import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";

import { parseStorefrontDataConfig, STOREFRONT_DATA_ENVIRONMENT_FIELDS } from "./lib/runtime-config.ts";
import { resolveDefaultCheckoutPaymentRuntime } from "./lib/checkout/runtime.ts";
import { digestRedemptionCredential, parseRedemptionCookie } from "./lib/checkout/redemption-cookie.ts";
import { selectTrustedStorefrontHostAuthority } from "./lib/trusted-host-authority.ts";
import { createCanonicalStorefrontLocation } from "./lib/custom-domain-canonicalization.ts";

const FALLBACK_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'";
const PAYTR_IFRAME_CSP = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; frame-src https://www.paytr.com";
const STANDARD_PAYTR_IFRAME_CSP = "default-src 'none'; frame-src https://www.paytr.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'";
const SECURITY_HEADERS = Object.freeze({ "cache-control": "private, no-store, no-transform", "referrer-policy": "strict-origin-when-cross-origin", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains" });

function unavailable(): NextResponse {
  return new NextResponse("Storefront unavailable", { status: 503, headers: { ...SECURITY_HEADERS, "content-security-policy": FALLBACK_CSP, "content-type": "text/plain; charset=utf-8" } });
}

type ProxyAuthority = ReturnType<typeof selectTrustedStorefrontHostAuthority>;
type StorefrontProxyDependencies = Readonly<{
  selectAuthority: (headers: Headers) => ProxyAuthority;
  resolveMediaOrigin: () => string;
  authorizePaytrIframe: (input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>) => Promise<boolean>;
  authorizeStandardHostedIframe?: (input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>) => Promise<boolean>;
  now: () => Date;
  resolveCanonicalHostname?: (input: Readonly<{hostname:string;now:Date}>) => Promise<string|null>;
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

async function defaultStandardHostedIframeAuthorization(input: Readonly<{ hostname: string; cookieHeader: string | null; now: Date }>): Promise<boolean> {
  try {
    const { resolveDefaultPublicStorefrontRuntime } = await import("./lib/default-runtime.ts");
    const runtime = (await resolveDefaultPublicStorefrontRuntime())?.hostedCheckout ?? null;
    if (runtime === null) return false;
    const presentation = await runtime.presentation({ hostname: input.hostname, cookieHeader: input.cookieHeader });
    return presentation.kind === "iframe" && new URL(presentation.url).origin === "https://www.paytr.com";
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
  authorizeStandardHostedIframe: defaultStandardHostedIframeAuthorization,
  now: () => new Date(),
  async resolveCanonicalHostname(input) {
    const { resolveDefaultPublicStorefrontRuntime } = await import("./lib/default-runtime.ts");
    const runtime = await resolveDefaultPublicStorefrontRuntime();
    if (!runtime) throw new Error("storefront_runtime_unavailable");
    try {
      const storefront = await runtime.repository.getPublicStorefront({ hostname: input.hostname, now: new Date(input.now) });
      return storefront.primaryHostname;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "not_found") return null;
      throw error;
    }
  },
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
    const authority = dependencies.selectAuthority(request.headers);
    if (authority.kind !== "trusted") return unavailable();
    const pathname = request.nextUrl.pathname;
    const exactTarget = request.nextUrl.search === "" && request.nextUrl.hash === "";
    const callbackPath = pathname === "/api/payments/paytr/callback";
    const originHealthPath = exactTarget && pathname === "/api/health" && request.method === "GET";
    if (callbackPath && exactTarget && request.method === "POST") {
      const callback = NextResponse.next();
      callback.headers.set("content-security-policy", FALLBACK_CSP);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) callback.headers.set(name, value);
      return callback;
    }
    if (callbackPath || pathname.startsWith("/api/payments/paytr/callback/")) return unavailable();
    if (dependencies.resolveCanonicalHostname && !originHealthPath) {
      try {
        const primaryHostname = await dependencies.resolveCanonicalHostname({ hostname: authority.hostname, now: dependencies.now() });
        if (primaryHostname !== null) {
          const location = createCanonicalStorefrontLocation({ requestedHostname: authority.hostname, primaryHostname, pathname, search: request.nextUrl.search });
          if (location !== null) return new NextResponse(null, { status: 308, headers: { ...SECURITY_HEADERS, "content-security-policy": FALLBACK_CSP, location } });
        }
      } catch { return unavailable(); }
    }
    if (exactTarget && pathname === "/checkout/payment") return NextResponse.next();
    let mediaOrigin: string;
    try {
      mediaOrigin = dependencies.resolveMediaOrigin();
    } catch { return unavailable(); }
    const nonce = randomBytes(18).toString("base64");
    const requestHeaders = new Headers(request.headers); requestHeaders.set("x-nonce", nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    let analytics:Readonly<{scriptOrigin:string;collectorOrigin:string}>|null=null;
    if(dependencies.resolveAnalytics){try{analytics=await dependencies.resolveAnalytics({hostname:authority.hostname,now:dependencies.now()})}catch{analytics=null}}
    const scriptDestination=analytics?` ${analytics.scriptOrigin}`:"",connectDestination=analytics?`'self' ${analytics.collectorOrigin}`:"'self'";
    const defaultCsp = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${scriptDestination}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: ${mediaOrigin}; font-src 'self' data: https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; object-src 'none'; connect-src ${connectDestination}`;
    let iframeAuthorized = false;
    if (exactTarget && pathname === "/odeme/hizli/odeme") {
      try {
        iframeAuthorized = await dependencies.authorizePaytrIframe({ hostname: authority.hostname,
          cookieHeader: request.headers.get("cookie"), now: dependencies.now() }) === true;
      } catch { iframeAuthorized = false; }
    }
    let standardIframeAuthorized = false;
    if (exactTarget && pathname === "/checkout/payment" && dependencies.authorizeStandardHostedIframe) {
      try {
        standardIframeAuthorized = await dependencies.authorizeStandardHostedIframe({ hostname: authority.hostname,
          cookieHeader: request.headers.get("cookie"), now: dependencies.now() }) === true;
      } catch { standardIframeAuthorized = false; }
    }
    const accountVerificationForm = pathname === "/account/verify";
    const quickOrderForm = exactTarget && pathname === "/odeme/hizli";
    const csp = standardIframeAuthorized
      ? STANDARD_PAYTR_IFRAME_CSP
      : accountVerificationForm || quickOrderForm
      ? `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'${scriptDestination}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: ${mediaOrigin}; font-src 'self' data: https://fonts.gstatic.com; base-uri 'none'; frame-ancestors 'none'; form-action https://${authority.hostname}; object-src 'none'; connect-src ${connectDestination}`
      : iframeAuthorized
        ? PAYTR_IFRAME_CSP
        : defaultCsp;
    response.headers.set("content-security-policy", csp);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    return response;
  };
}

const defaultProxy = createStorefrontProxy(DEFAULT_DEPENDENCIES);
export function proxy(request: NextRequest): Promise<NextResponse> { return defaultProxy(request); }

export const config = { matcher: ["/((?!health|_next/static|_next/image|favicon.ico).*)"] };
