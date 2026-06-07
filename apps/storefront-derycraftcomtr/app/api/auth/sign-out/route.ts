import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  clearLogtoCustomerSessionCookies,
  getLogtoLogoutRedirectUrl,
  readLogtoCustomerSessionCookie,
} from "@/lib/logto-customer-auth";

export async function GET(request: NextRequest) {
  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/giris?next=/hesap&logged_out=1",
  );
  const fallbackUrl = new URL(nextPath, request.url);

  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(fallbackUrl);
  }

  const session = readLogtoCustomerSessionCookie(request.cookies.getAll());
  const logoutUrl = await getLogtoLogoutRedirectUrl(session?.idToken ?? null, {
    postLogoutRedirectUrl: new URL(nextPath, STOREFRONT_RUNTIME.siteUrl).toString(),
  });
  const response = NextResponse.redirect(logoutUrl);

  clearLogtoCustomerSessionCookies(response);

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
