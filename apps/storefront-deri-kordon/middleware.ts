import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  LOCALE_COOKIE_NAME,
  buildLocalizedPath,
  detectPreferredLocale,
  getLocaleFromPathname,
  stripLocaleFromPathname,
} from "@/lib/i18n";

const rateLimitMap = new Map<string, { count: number; timestamp: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const AI_BOT_RATE_LIMIT = 10;
const STATIC_FILE_PATTERN = /\.[^/]+$/;

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

function cleanupRateLimitMap() {
  if (rateLimitMap.size <= 10000) {
    return;
  }

  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now - data.timestamp > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(key);
    }
  }
}

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip = request.ip || "unknown";
  const originalPathname = request.nextUrl.pathname;

  if (shouldBypassLocaleHandling(originalPathname)) {
    return NextResponse.next();
  }

  const locale = getLocaleFromPathname(originalPathname);
  const internalPathname = locale ? stripLocaleFromPathname(originalPathname) : originalPathname;
  const isAIBot = AI_BOTS.some((bot) => userAgent.toLowerCase().includes(bot.toLowerCase()));
  const isGeneralBot = GENERAL_BOTS.some((bot) => userAgent.toLowerCase().includes(bot.toLowerCase()));
  const isBot = isAIBot || isGeneralBot;

  if (isBot) {
    const now = Date.now();
    const limitKey = `${ip}:${userAgent.slice(0, 50)}`;
    const currentData = rateLimitMap.get(limitKey);

    if (currentData) {
      if (now - currentData.timestamp > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(limitKey, { count: 1, timestamp: now });
      } else {
        const limit = isAIBot ? AI_BOT_RATE_LIMIT : RATE_LIMIT_MAX;
        if (currentData.count >= limit) {
          return new NextResponse("Çok fazla istek. Lütfen daha sonra tekrar deneyin.", {
            status: 429,
            headers: {
              "Retry-After": "60",
              "X-RateLimit-Limit": String(limit),
              "X-RateLimit-Remaining": "0",
            },
          });
        }

        rateLimitMap.set(limitKey, {
          count: currentData.count + 1,
          timestamp: currentData.timestamp,
        });
      }
    } else {
      rateLimitMap.set(limitKey, { count: 1, timestamp: now });
    }

    if (isAIBot && (internalPathname.startsWith("/admin") || internalPathname.startsWith("/api"))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  if (!locale) {
    const preferredLocale = detectPreferredLocale(
      request.cookies.get(LOCALE_COOKIE_NAME)?.value,
      request.headers.get("accept-language"),
    );
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = buildLocalizedPath(originalPathname, preferredLocale);

    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set(LOCALE_COOKIE_NAME, preferredLocale, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
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

  cleanupRateLimitMap();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
