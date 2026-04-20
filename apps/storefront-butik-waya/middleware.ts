import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  applySecurityHeaders,
  hasExpectedInternalApiToken,
  isMutationMethod,
  validateSameOriginRequest,
} from "@celebix/platform-config/src/http-security";
import { checkRateLimit } from "@/lib/api-rate-limit";
import {
  LOCALE_COOKIE_NAME,
  buildLocalizedPath,
  detectPreferredLocale,
  getLocaleFromPathname,
  stripLocaleFromPathname,
} from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const AI_BOT_RATE_LIMIT = 10;
const PUBLIC_WRITE_RATE_LIMIT_WINDOW = 10 * 60 * 1000;
const STATIC_FILE_PATTERN = /\.[^/]+$/;
const INTERNAL_WRITE_API_PATHS = [
  "/api/categories",
  "/api/lucky-wheel/admin",
  "/api/pages",
  "/api/products",
  "/api/revalidate",
  "/api/seo",
  "/api/settings",
  "/api/upload/optimize",
] as const;
const PUBLIC_SENSITIVE_WRITE_API_PATHS = [
  "/api/abandoned-carts",
  "/api/auth/login",
  "/api/auth/register",
  "/api/customers",
  "/api/orders",
  "/api/payments/checkout",
  "/api/product-reviews",
  "/api/upload",
] as const;

const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "GoogleOther",
  "PerplexityBot",
  "CCBot",
  "Diffbot",
  "Cohere-ai",
  "ImagesiftBot",
  "Meta-ExternalAgent",
  "FacebookBot",
  "PetalBot",
  "YouBot",
];

const GENERAL_BOTS = [
  "bot",
  "crawler",
  "spider",
  "scrapy",
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "slurp",
  "facebot",
  "instagram",
  "applebot",
  "amazonbot",
];

function shouldBypassLocaleHandling(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/sitemap") ||
    STATIC_FILE_PATTERN.test(pathname)
  );
}

function withSecurity(request: NextRequest, response: NextResponse) {
  return applySecurityHeaders(request, response, "storefront");
}

function applyNoCacheHeaders(response: NextResponse, pathname: string) {
  if (pathname.startsWith("/urunler/") || pathname.startsWith("/api/")) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Surrogate-Control", "no-store");
  }
}

function isSecureRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

function matchesPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isInternalWriteProtectedApi(pathname: string, method: string) {
  return isMutationMethod(method) && INTERNAL_WRITE_API_PATHS.some((prefix) => matchesPath(pathname, prefix));
}

function isPublicSensitiveWriteApi(pathname: string, method: string) {
  return (
    isMutationMethod(method) &&
    PUBLIC_SENSITIVE_WRITE_API_PATHS.some((prefix) => matchesPath(pathname, prefix))
  );
}

function getPublicWriteLimit(pathname: string) {
  if (matchesPath(pathname, "/api/upload")) {
    return 10;
  }

  if (matchesPath(pathname, "/api/product-reviews")) {
    return 12;
  }

  if (matchesPath(pathname, "/api/auth/login") || matchesPath(pathname, "/api/auth/register")) {
    return 10;
  }

  if (matchesPath(pathname, "/api/orders") || matchesPath(pathname, "/api/payments/checkout")) {
    return 20;
  }

  return 15;
}

function sameOriginErrorMessage(reason: ReturnType<typeof validateSameOriginRequest>["reason"]) {
  if (reason === "missing-origin") {
    return "Guvenlik dogrulamasi icin origin basligi gerekli.";
  }

  return "Bu istek farklı bir origin üzerinden gönderilemez.";
}

async function handleBypassedRequest(request: NextRequest, pathname: string, ip: string) {
  if (isInternalWriteProtectedApi(pathname, request.method)) {
    const internalApiToken =
      process.env.CELEBIX_INTERNAL_API_TOKEN?.trim() ||
      process.env.STORE_INTERNAL_API_TOKEN?.trim();

    if (!hasExpectedInternalApiToken(request, internalApiToken)) {
      return NextResponse.json(
        { success: false, error: "Bu endpoint yalnizca ic otomasyon icin kullanilabilir." },
        { status: 403 },
      );
    }
  } else if (isPublicSensitiveWriteApi(pathname, request.method)) {
    const originCheck = validateSameOriginRequest(request);
    if (!originCheck.allowed) {
      return NextResponse.json(
        { success: false, error: sameOriginErrorMessage(originCheck.reason) },
        { status: 403 },
      );
    }

    const limit = getPublicWriteLimit(pathname);
    const rateLimitResult = await checkRateLimit({
      key: `storefront-write:${pathname}:${ip}`,
      limit,
      windowMs: PUBLIC_WRITE_RATE_LIMIT_WINDOW,
    });

    if (!rateLimitResult.allowed) {
      const response = NextResponse.json(
        { success: false, error: "Çok fazla istek. Lütfen biraz sonra tekrar deneyin." },
        { status: 429 },
      );
      response.headers.set("Retry-After", "600");
      response.headers.set("X-RateLimit-Limit", String(limit));
      response.headers.set("X-RateLimit-Remaining", String(rateLimitResult.remaining));
      return response;
    }
  }

  const response = NextResponse.next();
  applyNoCacheHeaders(response, pathname);
  return response;
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip = getRequestIp(request);
  const originalPathname = request.nextUrl.pathname;

  if (shouldBypassLocaleHandling(originalPathname)) {
    return withSecurity(request, await handleBypassedRequest(request, originalPathname, ip));
  }

  const localeRouting = await getLocaleRoutingConfig();
  const locale = getLocaleFromPathname(originalPathname);
  const internalPathname = locale ? stripLocaleFromPathname(originalPathname) : originalPathname;
  const normalizedUserAgent = userAgent.toLowerCase();
  const isAIBot = AI_BOTS.some((bot) => normalizedUserAgent.includes(bot.toLowerCase()));
  const isGeneralBot = GENERAL_BOTS.some((bot) => normalizedUserAgent.includes(bot.toLowerCase()));
  const isBot = isAIBot || isGeneralBot;

  if (isBot) {
    const limit = isAIBot ? AI_BOT_RATE_LIMIT : RATE_LIMIT_MAX;
    const rateLimitResult = await checkRateLimit({
      key: `bot-middleware:${ip}:${userAgent.slice(0, 50)}`,
      limit,
      windowMs: RATE_LIMIT_WINDOW,
    });

    if (!rateLimitResult.allowed) {
      return new NextResponse("Çok fazla istek. Lütfen daha sonra tekrar deneyin.", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      });
    }

    if (isAIBot && (internalPathname.startsWith("/admin") || internalPathname.startsWith("/api"))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (localeRouting.mode === "prefixless") {
    if (locale) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = internalPathname;
      return withSecurity(request, NextResponse.redirect(redirectUrl, 301));
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-celebix-locale", localeRouting.sourceLocale);
    requestHeaders.set("x-celebix-pathname", originalPathname);

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.cookies.set(LOCALE_COOKIE_NAME, localeRouting.sourceLocale, {
      path: "/",
      sameSite: "lax",
      secure: isSecureRequest(request),
      maxAge: 60 * 60 * 24 * 365,
    });

    applyNoCacheHeaders(response, originalPathname);

    if (isAIBot) {
      response.headers.set("X-Robots-Tag", "noai, noimageai");
      response.headers.set("X-Bot-Type", "AI");
      response.headers.set("X-RateLimit-Limit", String(AI_BOT_RATE_LIMIT));
    } else if (isGeneralBot) {
      response.headers.set("X-Bot-Type", "crawler");
    }

    return withSecurity(request, response);
  }

  if (locale && !localeRouting.availableLocales.includes(locale)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = buildLocalizedPath(
      internalPathname,
      localeRouting.sourceLocale,
      localeRouting,
    );
    return withSecurity(request, NextResponse.redirect(redirectUrl, 301));
  }

  if (!locale) {
    const preferredLocale = detectPreferredLocale(
      request.cookies.get(LOCALE_COOKIE_NAME)?.value,
      request.headers.get("accept-language"),
      localeRouting.availableLocales,
      localeRouting.sourceLocale,
    );
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = buildLocalizedPath(originalPathname, preferredLocale, localeRouting);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(LOCALE_COOKIE_NAME, preferredLocale, {
      path: "/",
      sameSite: "lax",
      secure: isSecureRequest(request),
      maxAge: 60 * 60 * 24 * 365,
    });
    return withSecurity(request, response);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-celebix-locale", locale);
  requestHeaders.set("x-celebix-pathname", internalPathname);

  const response =
    internalPathname !== originalPathname
      ? NextResponse.rewrite(new URL(`${internalPathname}${request.nextUrl.search}`, request.url), {
          request: { headers: requestHeaders },
        })
      : NextResponse.next({
          request: { headers: requestHeaders },
        });

  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(request),
    maxAge: 60 * 60 * 24 * 365,
  });

  applyNoCacheHeaders(response, internalPathname);

  if (isAIBot) {
    response.headers.set("X-Robots-Tag", "noai, noimageai");
    response.headers.set("X-Bot-Type", "AI");
    response.headers.set("X-RateLimit-Limit", String(AI_BOT_RATE_LIMIT));
  } else if (isGeneralBot) {
    response.headers.set("X-Bot-Type", "crawler");
  }

  return withSecurity(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
