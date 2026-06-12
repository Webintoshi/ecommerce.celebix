import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import {
  getLogtoCustomerLogoutRedirectUrl,
  isLogtoCustomerAuthEnabled,
} from "@/lib/logto-customer-auth";

export async function GET(request: NextRequest) {
  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/giris?logged_out=1",
  );

  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(new URL(nextPath, request.url));
  }

  return NextResponse.redirect(await getLogtoCustomerLogoutRedirectUrl(request.url, nextPath));
}
