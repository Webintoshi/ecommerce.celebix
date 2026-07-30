import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { buildLogtoAuthorizeUrl, writeLogtoAdminStateCookie } from "@/lib/logto-admin-auth";

export async function GET(request: NextRequest) {
  if (!isLogtoAdminAuthEnabled()) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/admin",
  );
  const screen = request.nextUrl.searchParams.get("screen");
  const loginHint =
    request.nextUrl.searchParams.get("login_hint") ??
    request.nextUrl.searchParams.get("email");
  const { url, statePayload } = await buildLogtoAuthorizeUrl(nextPath, {
    prompt:
      request.nextUrl.searchParams.get("force_account") === "1"
        ? "login"
        : undefined,
    firstScreen:
      screen === "reset_password"
        ? "reset_password"
        : screen === "identifier:sign-in"
          ? "identifier:sign-in"
          : undefined,
    identifier: loginHint ? ["email"] : undefined,
    loginHint,
    uiLocales: "tr",
  });
  const response = NextResponse.redirect(url);

  writeLogtoAdminStateCookie(response, statePayload);

  return response;
}
