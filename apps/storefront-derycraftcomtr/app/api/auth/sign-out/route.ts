import { NextRequest, NextResponse } from "next/server";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  clearLogtoCustomerSessionCookies,
  getLogtoLogoutRedirectUrl,
  readLogtoCustomerSessionCookie,
} from "@/lib/logto-customer-auth";
import { absoluteStorefrontUrl } from "@/lib/storefront-runtime";

export async function GET(request: NextRequest) {
  const fallbackUrl = absoluteStorefrontUrl("/");

  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(fallbackUrl);
  }

  const session = readLogtoCustomerSessionCookie(request.cookies.getAll());
  const logoutUrl = await getLogtoLogoutRedirectUrl(session?.idToken ?? null);
  const response = NextResponse.redirect(logoutUrl);

  clearLogtoCustomerSessionCookies(response);

  return response;
}
