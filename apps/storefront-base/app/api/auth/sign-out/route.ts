import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  clearLogtoCustomerSessionCookies,
  getLogtoLogoutRedirectUrl,
} from "@/lib/logto-customer-auth";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export async function GET(request: NextRequest) {
  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/giris?next=/hesap&logged_out=1",
  );
  const fallbackUrl = new URL(nextPath, STOREFRONT_RUNTIME.siteUrl);

  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(fallbackUrl);
  }

  const postLogoutRedirectUrl = new URL(nextPath, STOREFRONT_RUNTIME.siteUrl).toString();
  let logoutUrl = fallbackUrl.toString();

  try {
    logoutUrl = await getLogtoLogoutRedirectUrl(null, { postLogoutRedirectUrl });
  } catch {
    logoutUrl = fallbackUrl.toString();
  }

  const response = NextResponse.redirect(logoutUrl);
  clearLogtoCustomerSessionCookies(response);

  return response;
}
