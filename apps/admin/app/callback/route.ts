import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { clearAdminRoleCookie, writeAdminRoleCookie } from "@/lib/admin-role-cookie";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import {
  buildLogtoAdminSessionPayload,
  clearLogtoAdminSessionCookies,
  exchangeLogtoCodeForTokens,
  fetchLogtoUserInfo,
  findLegacyAdminBridgeByLogtoSubject,
  readLogtoAdminStateCookie,
  writeLogtoAdminSessionCookie,
} from "@/lib/logto-admin-auth";

function buildAdminRedirect(pathname: string, params?: Record<string, string>) {
  const url = new URL(pathname, STORE_RUNTIME.adminUrl);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

function buildLoginRedirect(params: Record<string, string>) {
  const url = buildAdminRedirect("/admin/login");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function GET(request: NextRequest) {
  if (!isLogtoAdminAuthEnabled()) {
    return NextResponse.redirect(buildLoginRedirect({ error: "provider_disabled" }));
  }

  const stateCookie = readLogtoAdminStateCookie(request.cookies.getAll());
  const stateParam = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!stateCookie || !stateParam || stateCookie.state !== stateParam || !code) {
    const response = NextResponse.redirect(buildLoginRedirect({ error: "invalid_callback" }));
    clearAdminRoleCookie(response);
    clearLogtoAdminSessionCookies(response);
    return response;
  }

  try {
    const tokens = await exchangeLogtoCodeForTokens(code);
    const userInfo = await fetchLogtoUserInfo(tokens.access_token);
    const bridge = await findLegacyAdminBridgeByLogtoSubject(userInfo.sub);

    if (!bridge) {
      const response = NextResponse.redirect(buildLoginRedirect({ error: "unauthorized" }));
      clearAdminRoleCookie(response);
      clearLogtoAdminSessionCookies(response);
      return response;
    }

    const nextPath = sanitizeInternalRedirectPath(stateCookie.nextPath, "/admin");
    const response = NextResponse.redirect(buildAdminRedirect(nextPath));
    const sessionPayload = buildLogtoAdminSessionPayload({
      bridge,
      userInfo,
      idToken: tokens.id_token ?? null,
    });

    clearLogtoAdminSessionCookies(response);
    writeLogtoAdminSessionCookie(response, sessionPayload);
    writeAdminRoleCookie(response, {
      userId: bridge.userId,
      role: bridge.role,
    });

    return response;
  } catch (error) {
    console.error("Logto admin callback failed:", error);
    const response = NextResponse.redirect(buildLoginRedirect({ error: "login_failed" }));
    clearAdminRoleCookie(response);
    clearLogtoAdminSessionCookies(response);
    return response;
  }
}
