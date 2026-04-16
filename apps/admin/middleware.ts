import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/permissions";
import { getSessionUserFromCookies } from "@/lib/admin-session-cookie";
import {
  applySecurityHeaders,
  isMutationMethod,
  validateSameOriginRequest,
} from "@celebix/platform-config/src/http-security";
import {
  getSupabaseServiceRoleKey,
} from "@/lib/supabase-shared";
import { readCachedAdminProfile, writeCachedAdminProfile } from "@/lib/admin-profile-cache";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_LOGIN_API_PATH = "/api/auth/login";
const ADMIN_ROLES = new Set(["super_admin", "product_manager", "content_creator", "order_manager"]);
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 8;

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

  const user = await getSessionUserFromCookies(request.cookies.getAll());

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

  let profile = readCachedAdminProfile(user.id);

  if (!profile) {
    const serviceClient = createClient(getSupabaseServerUrl(), getSupabaseServiceRoleKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data } = await serviceClient
      .from("profiles")
      .select("id,full_name,role,task_definition")
      .eq("id", user.id)
      .maybeSingle<{
        id: string;
        full_name: string | null;
        role: string;
        task_definition: string | null;
      }>();

    if (data) {
      profile = {
        id: data.id,
        full_name: data.full_name,
        role: data.role as UserRole,
        task_definition: data.task_definition,
      };
      writeCachedAdminProfile(profile);
    }
  }

  if (!profile || !ADMIN_ROLES.has(profile.role)) {
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
