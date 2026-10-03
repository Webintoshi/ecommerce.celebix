import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {ownerAuthFetch} from "@/lib/platform/auth-fetch";
import {ownerPublicOrigin,ownerSameOrigin} from "@/lib/platform/origin";
import {
  applySecurityHeaders,
  isMutationMethod,
  type SecurityHeaderOptions,
  validateSameOriginRequest,
} from "@celebix/platform-config/src/http-security";
import {
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  SELF_SERVE_INTERNAL_CALLBACK_PATH,
} from "@celebix/platform-config/src/saas";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";
import {
  expireOwnerAuthCookies,
  hasOwnerAuthCookies,
} from "@/lib/owner-auth-cookies";
import {
  formatMissingOwnerSupabaseEnvMessage,
  getMissingOwnerSupabaseEnvNames,
  getOwnerSupabaseAnonKey,
  getOwnerSupabaseUrl,
} from "@/lib/owner-supabase-shared";

const OWNER_LOGIN_PATH = "/login";
const OWNER_LOGIN_API_PATH = "/api/auth/login";
const OWNER_PUBLIC_RUNTIME_API_PATH = "/api/public/runtime";
const OWNER_PUBLIC_HEALTH_API_PATH = "/api/health";
const OWNER_PUBLIC_REGISTRATION_PATH = "/api/self-serve/register";
const OWNER_PUBLIC_ORDER_EMAIL_WEBHOOK_PATH = "/api/webhooks/resend/order-email";
const OWNER_CONFIRM_PREFIX = "/auth/confirm";
const OWNER_RECOVER_PATH = "/auth/recover";
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 8;
const INTERNAL_HMAC_PATHS = new Set([
  PANEL_BROWSER_BINDING_INTERNAL_PATH,
  SELF_SERVE_INTERNAL_CALLBACK_PATH,
  "/api/internal/platform-invitations",
]);
const SELF_SERVE_PUBLIC_PREFIXES = [
  "/branding",
  "/magaza-ac",
  "/kayit",
  "/onboarding",
  "/api/self-serve/auth/start",
  "/api/self-serve/register",
  "/api/self-serve/requests",
];


function withSecurity(
  request: NextRequest,
  response: NextResponse,
  options?: SecurityHeaderOptions,
) {
  return applySecurityHeaders(request, response, "owner", options);
}

function buildRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-owner-pathname", request.nextUrl.pathname);
  return headers;
}

function nextResponse(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: buildRequestHeaders(request),
    },
  });
}

function jsonResponse(request: NextRequest, body: Record<string, unknown>, status: number) {
  return withSecurity(request, NextResponse.json(body, { status }));
}

function isProtectedOwnerPage(pathname: string) {
  return (
    !pathname.startsWith("/api") &&
    pathname !== OWNER_LOGIN_PATH &&
    pathname !== OWNER_RECOVER_PATH &&
    !pathname.startsWith(OWNER_CONFIRM_PREFIX) &&
    !pathname.startsWith("/security") &&
    !pathname.startsWith("/auth/v1/")
  );
}

function isPublicSelfServeRoute(pathname: string) {
  return SELF_SERVE_PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isInternalHmacRoute(pathname: string) {
  return INTERNAL_HMAC_PATHS.has(pathname);
}

function isProtectedOwnerApi(pathname: string) {
  return (
    pathname.startsWith("/api") &&
    pathname !== OWNER_LOGIN_API_PATH &&
    pathname !== OWNER_PUBLIC_RUNTIME_API_PATH
  );
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL(OWNER_LOGIN_PATH, ownerPublicOrigin(request) ?? request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return withSecurity(request, NextResponse.redirect(loginUrl));
}

function buildRecoverRedirect(request: NextRequest) {
  const recoverUrl = new URL(OWNER_RECOVER_PATH, ownerPublicOrigin(request) ?? request.url);
  recoverUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return withSecurity(request, NextResponse.redirect(recoverUrl));
}

function buildLoginErrorRedirect(request: NextRequest, errorCode: string) {
  const loginUrl = new URL(OWNER_LOGIN_PATH, ownerPublicOrigin(request) ?? request.url);
  loginUrl.searchParams.set("error", errorCode);
  if (request.nextUrl.pathname !== OWNER_LOGIN_PATH) {
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  }
  return withSecurity(request, NextResponse.redirect(loginUrl));
}

function getSameOriginErrorMessage(reason: ReturnType<typeof validateSameOriginRequest>["reason"]) {
  if (reason === "missing-origin") {
    return "Guvenlik dogrulamasi icin origin basligi gerekli.";
  }

  return "Bu istek farkli bir origin uzerinden gonderilemez.";
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/auth/v1/") || pathname.startsWith("/security")) {
    return withSecurity(request, nextResponse(request));
  }

  if (pathname === OWNER_PUBLIC_ORDER_EMAIL_WEBHOOK_PATH) {
    return withSecurity(request, nextResponse(request));
  }

  if (pathname === OWNER_PUBLIC_RUNTIME_API_PATH || pathname === OWNER_PUBLIC_HEALTH_API_PATH) {
    return withSecurity(request, nextResponse(request));
  }

  if (isPublicSelfServeRoute(pathname)) {
    return withSecurity(
      request,
      nextResponse(request),
      pathname === OWNER_PUBLIC_REGISTRATION_PATH
        ? { contentSecurityPolicy: "route-owned" }
        : undefined,
    );
  }

  if (isInternalHmacRoute(pathname)) {
    return withSecurity(request, nextResponse(request));
  }

  const requiresAuth = isProtectedOwnerPage(pathname) || isProtectedOwnerApi(pathname);
  const missingPublicEnv = getMissingOwnerSupabaseEnvNames();
  const missingAuthEnv = getMissingOwnerSupabaseEnvNames({ requireServiceRole: true });

  if (missingPublicEnv.length > 0) {
    const message = formatMissingOwnerSupabaseEnvMessage(missingPublicEnv);

    if (pathname.startsWith("/api/") && pathname !== OWNER_PUBLIC_RUNTIME_API_PATH) {
      return jsonResponse(request, { error: message }, 503);
    }

    if (
      pathname === OWNER_LOGIN_PATH ||
      pathname === OWNER_RECOVER_PATH ||
      pathname.startsWith(OWNER_CONFIRM_PREFIX)
    ) {
      return withSecurity(request, NextResponse.next());
    }

    return buildLoginErrorRedirect(request, "owner_auth_env_missing");
  }

  if (missingAuthEnv.length > 0) {
    const message = formatMissingOwnerSupabaseEnvMessage(missingAuthEnv);

    if (pathname.startsWith("/api/") && pathname !== OWNER_PUBLIC_RUNTIME_API_PATH) {
      return jsonResponse(request, { error: message }, 503);
    }

    if (
      pathname === OWNER_LOGIN_PATH ||
      pathname === OWNER_RECOVER_PATH ||
      pathname.startsWith(OWNER_CONFIRM_PREFIX)
    ) {
      return withSecurity(request, NextResponse.next());
    }

    return buildLoginErrorRedirect(request, "owner_auth_service_missing");
  }

  if (pathname === OWNER_LOGIN_API_PATH && request.method === "POST") {
    const originCheck = {allowed:ownerSameOrigin(request),reason:"origin-mismatch" as const};
    if (!originCheck.allowed) {
      return jsonResponse(request, { error: getSameOriginErrorMessage(originCheck.reason) }, 403);
    }

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit({
      key: `owner-login:${ip}`,
      limit: LOGIN_RATE_LIMIT_MAX,
      windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      const response = NextResponse.json(
        { error: "Cok fazla giris denemesi. Lutfen biraz sonra tekrar deneyin." },
        { status: 429 },
      );
      response.headers.set("Retry-After", "600");
      response.headers.set("X-RateLimit-Limit", String(LOGIN_RATE_LIMIT_MAX));
      response.headers.set("X-RateLimit-Remaining", String(rateLimit.remaining));
      return withSecurity(request, response);
    }
  }

  if (!requiresAuth && pathname !== OWNER_LOGIN_PATH) {
    return withSecurity(request, NextResponse.next());
  }

  if (isProtectedOwnerApi(pathname) && isMutationMethod(request.method)) {
    const originCheck = {allowed:ownerSameOrigin(request),reason:"origin-mismatch" as const};
    if (!originCheck.allowed) {
      return jsonResponse(request, { error: getSameOriginErrorMessage(originCheck.reason) }, 403);
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(getOwnerSupabaseUrl(), getOwnerSupabaseAnonKey(), {
    global:{fetch:ownerAuthFetch},
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          response.cookies.set(cookie.name, cookie.value, {...cookie.options,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'});
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const requestCookies = request.cookies.getAll();

  if (!user) {
    if (pathname === OWNER_LOGIN_PATH) {
      if (hasOwnerAuthCookies(requestCookies)) {
        return expireOwnerAuthCookies(buildRecoverRedirect(request), requestCookies);
      }

      return withSecurity(request, response);
    }

    if (pathname === OWNER_RECOVER_PATH) {
      return withSecurity(request, expireOwnerAuthCookies(response, requestCookies));
    }

    if (pathname.startsWith("/api/")) {
      const unauthorizedResponse = NextResponse.json({ error: "Owner oturumu gerekli." }, { status: 401 });
      return withSecurity(request, expireOwnerAuthCookies(unauthorizedResponse, requestCookies));
    }

    if (hasOwnerAuthCookies(requestCookies)) {
      return expireOwnerAuthCookies(buildRecoverRedirect(request), requestCookies);
    }

    return expireOwnerAuthCookies(buildLoginRedirect(request), requestCookies);
  }

  // Middleware refreshes the provider session only. Every protected page/API
  // resolves the immutable operator registry and MFA itself; legacy profiles
  // are never queried or treated as platform authority here.

  return withSecurity(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
