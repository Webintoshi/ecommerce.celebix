import { NextRequest, NextResponse } from "next/server";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { clearAdminRoleCookie } from "@/lib/admin-role-cookie";
import {
  clearLogtoAdminSessionCookies,
  getLogtoLogoutRedirectUrl,
  readLogtoAdminSessionCookie,
} from "@/lib/logto-admin-auth";
import { buildAdminUrl } from "@/lib/store-runtime";

export async function GET(request: NextRequest) {
  const session = readLogtoAdminSessionCookie(request.cookies.getAll());
  const redirectUrl = isLogtoAdminAuthEnabled()
    ? await getLogtoLogoutRedirectUrl(session?.idToken ?? null)
    : buildAdminUrl("/admin/login");
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
