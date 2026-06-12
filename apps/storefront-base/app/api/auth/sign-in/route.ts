import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import {
  buildLogtoCustomerAuthorizeUrl,
  isLogtoCustomerAuthEnabled,
  writeLogtoCustomerStateCookie,
} from "@/lib/logto-customer-auth";

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(new URL("/giris?auth=unavailable", request.url));
  }

  const nextPath = sanitizeInternalRedirectPath(request.nextUrl.searchParams.get("next"), "/hesap");
  const loginHint =
    request.nextUrl.searchParams.get("login_hint") ??
    request.nextUrl.searchParams.get("email") ??
    null;
  const { url, statePayload } = await buildLogtoCustomerAuthorizeUrl(request.url, nextPath, {
    directSignIn: request.nextUrl.searchParams.get("directSignIn"),
    firstScreen:
      request.nextUrl.searchParams.get("firstScreen") ??
      request.nextUrl.searchParams.get("first_screen"),
    identifier: request.nextUrl.searchParams.get("identifier"),
    loginHint,
  });
  const response = NextResponse.redirect(url);
  writeLogtoCustomerStateCookie(response, statePayload);

  return response;
}
