import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/api-rate-limit";

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const AI_BOT_RATE_LIMIT = 10;

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

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip") || "unknown";
}

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";
  const ip = getRequestIp(request);
  const pathname = request.nextUrl.pathname;

  const response = NextResponse.next({
    request: {
      headers: new Headers(request.headers),
    },
  });

  applyNoCacheHeaders(response, pathname);

  const staticExtensions = [".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2"];
  const isStatic = staticExtensions.some((extension) => pathname.endsWith(extension));
  if (isStatic) {
    return NextResponse.next();
  }

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
      return new NextResponse("Cok fazla istek. Lutfen daha sonra tekrar deneyin.", {
        status: 429,
        headers: {
          "Retry-After": "60",
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      });
    }

    if (isAIBot) {
      response.headers.set("X-Robots-Tag", "noai, noimageai");
      response.headers.set("X-Bot-Type", "AI");
      response.headers.set("X-RateLimit-Limit", String(AI_BOT_RATE_LIMIT));

      if (pathname.startsWith("/admin") || pathname.startsWith("/api")) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    } else if (isGeneralBot) {
      response.headers.set("X-Bot-Type", "crawler");
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
