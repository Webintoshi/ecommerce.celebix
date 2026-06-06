import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearAdminRoleCookie } from "@/lib/admin-role-cookie";
import {
  clearLogtoAdminSessionCookies,
  getLogtoLogoutRedirectUrl,
  readLogtoAdminSessionCookie,
} from "@/lib/logto-admin-auth";

export async function POST() {
  const cookieStore = await cookies();
  const session = readLogtoAdminSessionCookie(cookieStore.getAll());
  const response = NextResponse.json({
    success: true,
    redirectUrl: session ? await getLogtoLogoutRedirectUrl(session.idToken) : null,
  });

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.startsWith("sb-")) {
      continue;
    }

    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      path: "/",
    });
  }

  clearAdminRoleCookie(response);
  clearLogtoAdminSessionCookies(response);

  return response;
}
