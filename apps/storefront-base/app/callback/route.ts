import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  clearLogtoCustomerSessionCookies,
  readLogtoCustomerStateCookie,
} from "@/lib/logto-customer-auth";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

function buildStorefrontUrl(path: string) {
  return new URL(path, STOREFRONT_RUNTIME.siteUrl);
}

function buildLoginRedirect(params: Record<string, string>) {
  const url = buildStorefrontUrl("/giris");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(buildLoginRedirect({ error: "provider_disabled" }));
  }

  const stateCookie = readLogtoCustomerStateCookie(request.cookies.getAll());
  const stateParam = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!stateCookie || !stateParam || stateCookie.state !== stateParam || !code) {
    const response = NextResponse.redirect(buildLoginRedirect({ error: "invalid_callback" }));
    clearLogtoCustomerSessionCookies(response);
    return response;
  }

  const nextPath = sanitizeInternalRedirectPath(stateCookie.nextPath, "/hesap");
  const response = NextResponse.redirect(buildStorefrontUrl(nextPath));
  clearLogtoCustomerSessionCookies(response);

  return response;
}
