import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  isLightPostgresRuntime,
  resolveRuntimeAuthSetupStatus,
} from "@celebix/platform-config/src/light-postgres-runtime";
import {
  applySecurityHeaders,
  isMutationMethod,
  validateSameOriginRequest,
} from "@celebix/platform-config/src/http-security";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_LOGIN_API_PATH = "/api/auth/login";
const ADMIN_ROLES = new Set(["super_admin", "product_manager", "content_creator", "order_manager"]);
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 8;

function isLightPostgresAuthBlocked() {
  return (
    isLightPostgresRuntime(process.env, {
      mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
    }) &&
    resolveRuntimeAuthSetupStatus(process.env, {
      mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
      authStatus: ["AUTH_SETUP_STATUS", "NEXT_PUBLIC_AUTH_SETUP_STATUS"],
    }) === "blocked_auth_setup"
  );
}

function createBlockedAuthApiResponse(request: NextRequest) {
  return applySecurityHeaders(
    request,
    NextResponse.json(
      {
        success: false,
        code: "blocked_auth_setup",
        error: "Bu store icin admin auth kurulumu henuz tamamlanmadi.",
      },
      { status: 503 },
    ),
    "admin",
  );
}

function isProtectedAdminPage(pathname: string) {
  return pathname.startsWith("/admin") && pathname !== ADMIN_LOGIN_PATH;
}

function isProtectedApi(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/admin")) {
    return true;
  }

  if (pathname.startsWith("/api/settings")) {
    return true;
  }

  if (pathname.startsWith("/api/upload")) {
    return true;
  }

  if (pathname.startsWith("/api/pages")) {
    return true;
  }

  if (pathname.startsWith("/api/seo")) {
    return true;
  }

  if (pathname.startsWith("/api/revalidate")) {
    return true;
  }

  if (pathname.startsWith("/api/customers")) {
    return pathname !== "/api/customers/create-from-auth";
  }

  if (pathname === "/api/products" || pathname === "/api/categories") {
    return request.method !== "GET";
  }

  return false;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const requiresAuth = isProtectedAdminPage(pathname) || isProtectedApi(request);
  const lightPostgresAuthBlocked = isLightPostgresAuthBlocked();

  if (pathname === ADMIN_LOGIN_API_PATH && request.method === "POST" && lightPostgresAuthBlocked) {
    return createBlockedAuthApiResponse(request);
  }

  if (pathname === ADMIN_LOGIN_API_PATH && request.method === "POST") {
    const originCheck = validateSameOriginRequest(request);
    if (!originCheck.allowed) {
      return applySecurityHeaders(
        request,
        NextResponse.json({ error: "Bu istek farkli bir origin uzerinden gonderilemez." }, { status: 403 }),
        "admin",
      );
    }

    const ip = getRequestIp(request);
    const rateLimit = await checkRateLimit({
      key: `admin-login:${ip}`,
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
      return applySecurityHeaders(request, response, "admin");
    }
  }

  if (!requiresAuth) {
    return applySecurityHeaders(request, NextResponse.next(), "admin");
  }

  if (lightPostgresAuthBlocked) {
    if (pathname.startsWith("/api/")) {
      return createBlockedAuthApiResponse(request);
    }

    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("blocked_auth_setup", "1");
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return applySecurityHeaders(request, NextResponse.redirect(loginUrl), "admin");
  }

  if (pathname.startsWith("/api/") && isMutationMethod(request.method)) {
    const originCheck = validateSameOriginRequest(request);
    if (!originCheck.allowed) {
      return applySecurityHeaders(
        request,
        NextResponse.json({ success: false, error: "Bu istek farkli bir origin uzerinden gonderilemez." }, { status: 403 }),
        "admin",
      );
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        request,
        NextResponse.json({ success: false, error: "Yetkisiz erisim." }, { status: 401 }),
        "admin",
      );
    }

    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return applySecurityHeaders(request, NextResponse.redirect(loginUrl), "admin");
  }

  const serviceClient = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile } = await serviceClient.from("profiles").select("role").eq("id", user.id).maybeSingle<{ role: string }>();

  if (!profile || !ADMIN_ROLES.has(profile.role)) {
    await supabase.auth.signOut();

    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        request,
        NextResponse.json({ success: false, error: "Admin yetkisi bulunamadi." }, { status: 403 }),
        "admin",
      );
    }

    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    return applySecurityHeaders(request, NextResponse.redirect(loginUrl), "admin");
  }

  if (pathname === ADMIN_LOGIN_PATH) {
    return applySecurityHeaders(request, NextResponse.redirect(new URL("/admin", request.url)), "admin");
  }

  return applySecurityHeaders(request, response, "admin");
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
  runtime: "nodejs",
};
