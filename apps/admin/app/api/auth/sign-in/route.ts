import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { buildLogtoAuthorizeUrl, writeLogtoAdminStateCookie } from "@/lib/logto-admin-auth";
import { buildAdminUrl } from "@/lib/store-runtime";

export async function GET(request: NextRequest) {
  if (!isLogtoAdminAuthEnabled()) {
    return NextResponse.redirect(buildAdminUrl("/admin/login"));
  }

  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/admin",
  );
  const { url, statePayload } = await buildLogtoAuthorizeUrl(nextPath);
  const response = NextResponse.redirect(url);

  writeLogtoAdminStateCookie(response, statePayload);

  return response;
}
