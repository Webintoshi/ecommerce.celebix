import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/supabase-shared";

const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_ROLES = new Set(["super_admin", "product_manager", "content_creator", "order_manager"]);

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
  const requiresAuth = isProtectedAdminPage(request.nextUrl.pathname) || isProtectedApi(request);

  if (!requiresAuth) {
    return NextResponse.next();
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
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Yetkisiz erisim." }, { status: 401 });
    }

    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
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

    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Admin yetkisi bulunamadi." }, { status: 403 });
    }

    const loginUrl = new URL(ADMIN_LOGIN_PATH, request.url);
    loginUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname === ADMIN_LOGIN_PATH) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/:path*"],
};
