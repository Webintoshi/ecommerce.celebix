import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import {
  applySecurityHeaders,
  isMutationMethod,
  validateSameOriginRequest,
} from "@celebix/platform-config/src/http-security";
import { checkRateLimit, getRequestIp } from "@/lib/api-rate-limit";
import {
  getOwnerSupabaseAnonKey,
  getOwnerSupabaseServiceRoleKey,
  getOwnerSupabaseUrl,
} from "@/lib/owner-supabase-shared";

const OWNER_LOGIN_PATH = "/login";
const OWNER_LOGIN_API_PATH = "/api/auth/login";
const OWNER_CONFIRM_PREFIX = "/auth/confirm";
const OWNER_ROLES = new Set(["super_admin", "affiliate_admin"]);
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 8;

type OwnerProfileRecord = {
  role: string;
  is_active: boolean;
};

function withSecurity(request: NextRequest, response: NextResponse) {
  return applySecurityHeaders(request, response, "owner");
}

function jsonResponse(request: NextRequest, body: Record<string, unknown>, status: number) {
  return withSecurity(request, NextResponse.json(body, { status }));
}

function isProtectedOwnerPage(pathname: string) {
  return pathname !== OWNER_LOGIN_PATH && !pathname.startsWith(OWNER_CONFIRM_PREFIX);
}

function isProtectedOwnerApi(pathname: string) {
  return pathname.startsWith("/api") && pathname !== OWNER_LOGIN_API_PATH;
}

function buildLoginRedirect(request: NextRequest) {
  const loginUrl = new URL(OWNER_LOGIN_PATH, request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
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
  const requiresAuth = isProtectedOwnerPage(pathname) || isProtectedOwnerApi(pathname);

  if (pathname === OWNER_LOGIN_API_PATH && request.method === "POST") {
    const originCheck = validateSameOriginRequest(request);
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
    const originCheck = validateSameOriginRequest(request);
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
    if (pathname === OWNER_LOGIN_PATH) {
      return withSecurity(request, response);
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse(request, { error: "Owner oturumu gerekli." }, 401);
    }

    return buildLoginRedirect(request);
  }

  const serviceClient = createClient(getOwnerSupabaseUrl(), getOwnerSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: profile } = await serviceClient
    .from("owner_profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle<OwnerProfileRecord>();

  if (!profile || !profile.is_active || !OWNER_ROLES.has(profile.role)) {
    await supabase.auth.signOut();

    if (pathname === OWNER_LOGIN_PATH) {
      return withSecurity(request, response);
    }

    if (pathname.startsWith("/api/")) {
      return jsonResponse(request, { error: "Owner yetkisi bulunamadi." }, 403);
    }

    const loginUrl = new URL(OWNER_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    return withSecurity(request, NextResponse.redirect(loginUrl));
  }

  if (pathname === OWNER_LOGIN_PATH) {
    return withSecurity(request, NextResponse.redirect(new URL("/", request.url)));
  }

  return withSecurity(request, response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
  runtime: "nodejs",
};
