import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { clearAdminRoleCookie } from "@/lib/admin-role-cookie";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import {
  clearLogtoAdminSessionCookies,
  getLogtoLogoutRedirectUrl,
  readLogtoAdminSessionCookie,
} from "@/lib/logto-admin-auth";

export async function GET(request: NextRequest) {
  const session = readLogtoAdminSessionCookie(request.cookies.getAll());
  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/admin/login?logged_out=1",
  );
  const redirectUrl = await getLogtoLogoutRedirectUrl(session?.idToken ?? null, {
    postLogoutRedirectUrl: new URL(nextPath, STORE_RUNTIME.adminUrl).toString(),
  });
  const response = NextResponse.redirect(redirectUrl);

  clearAdminRoleCookie(response);
  clearLogtoAdminSessionCookies(response);

  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith("sb-")) {
      continue;
    }

    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      path: "/",
    });
  }

  return response;
}
