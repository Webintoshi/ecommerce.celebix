import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { buildLogtoAuthorizeUrl, writeLogtoAdminStateCookie } from "@/lib/logto-admin-auth";

function isPlaceholderClientId(value: string | null): boolean {
  const normalized = value?.trim().toLowerCase() ?? "";
  return (
    !normalized ||
    normalized.startsWith("placeholder-") ||
    normalized.startsWith("configure-") ||
    normalized === "configure-in-env" ||
    normalized.includes("placeholder")
  );
}

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
  let authorize;
  try {
    authorize = await buildLogtoAuthorizeUrl(nextPath, {
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
  } catch {
    return NextResponse.json(
      {
        error: "Admin Logto auth kurulumu henuz tamamlanmadi.",
        code: "pending_auth_setup",
      },
      { status: 503 },
    );
  }

  const clientId = authorize.url.searchParams.get("client_id");
  if (isPlaceholderClientId(clientId)) {
    return NextResponse.json(
      {
        error: "Admin Logto auth kurulumu henuz tamamlanmadi.",
        code: "pending_auth_setup",
      },
      { status: 503 },
    );
  }

  const { url, statePayload } = authorize;
  const response = NextResponse.redirect(url);

  writeLogtoAdminStateCookie(response, statePayload);

  return response;
}
