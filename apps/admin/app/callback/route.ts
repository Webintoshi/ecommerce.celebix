import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { clearAdminRoleCookie, writeAdminRoleCookie } from "@/lib/admin-role-cookie";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { resolveAdminCallback } from "@/lib/admin-callback-flow";
import type { AdminLoginErrorCode } from "@/lib/admin-login-contract";
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

function logCallbackFailure(input: {
  errorCode: AdminLoginErrorCode;
  correlationId: string;
}) {
  console.warn("Celebix admin authentication event", {
    event: "admin_callback_failed",
    errorCode: input.errorCode,
    storeSlug: STORE_RUNTIME.slug,
    correlationId: input.correlationId,
  });
}

function buildLoginFailureResponse(input: {
  errorCode: AdminLoginErrorCode;
  nextPath: string;
  correlationId: string;
}) {
  logCallbackFailure(input);

  const response = NextResponse.redirect(
    buildAdminRedirect("/admin/login", {
      error: input.errorCode,
      next: sanitizeInternalRedirectPath(input.nextPath, "/admin"),
      cid: input.correlationId,
    }),
  );
  clearAdminRoleCookie(response);
  clearLogtoAdminSessionCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const correlationId = randomUUID();
  const requestedNextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/admin",
  );

  if (!isLogtoAdminAuthEnabled()) {
    return buildLoginFailureResponse({
      errorCode: "provider_disabled",
      nextPath: requestedNextPath,
      correlationId,
    });
  }

  const stateCookie = readLogtoAdminStateCookie(request.cookies.getAll());
  const nextPath = sanitizeInternalRedirectPath(
    stateCookie?.nextPath ?? requestedNextPath,
    "/admin",
  );
  const stateParam = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!stateCookie || !stateParam || stateCookie.state !== stateParam || !code) {
    return buildLoginFailureResponse({
      errorCode: "invalid_callback",
      nextPath,
      correlationId,
    });
  }

  const callbackResult = await resolveAdminCallback({
    exchangeCode: () =>
      exchangeLogtoCodeForTokens(code, stateCookie.codeVerifier),
    fetchIdentity: (tokens) => fetchLogtoUserInfo(tokens.access_token),
    readSubject: (identity) =>
      typeof identity.sub === "string" ? identity.sub : null,
    findMembership: (subject) => findLegacyAdminBridgeByLogtoSubject(subject),
  });

  if (!callbackResult.ok) {
    return buildLoginFailureResponse({
      errorCode: callbackResult.error,
      nextPath,
      correlationId,
    });
  }

  try {
    const response = NextResponse.redirect(buildAdminRedirect(nextPath));
    const sessionPayload = buildLogtoAdminSessionPayload({
      bridge: callbackResult.membership,
      userInfo: callbackResult.identity,
      idToken: callbackResult.tokens.id_token ?? null,
    });

    clearLogtoAdminSessionCookies(response);
    writeLogtoAdminSessionCookie(response, sessionPayload);
    writeAdminRoleCookie(response, {
      userId: callbackResult.membership.userId,
      role: callbackResult.membership.role,
    });

    return response;
  } catch {
    return buildLoginFailureResponse({
      errorCode: "session_write_failed",
      nextPath,
      correlationId,
    });
  }
}
