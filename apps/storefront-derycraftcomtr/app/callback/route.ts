import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  buildLogtoCustomerSessionPayload,
  clearLogtoCustomerSessionCookies,
  exchangeLogtoCodeForTokens,
  fetchLogtoUserInfo,
  findOrProvisionCustomerBridge,
  readLogtoCustomerStateCookie,
  writeLogtoCustomerSessionCookie,
} from "@/lib/logto-customer-auth";

function buildLoginRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/giris", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(buildLoginRedirect(request, { error: "provider_disabled" }));
  }

  const stateCookie = readLogtoCustomerStateCookie(request.cookies.getAll());
  const stateParam = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!stateCookie || !stateParam || stateCookie.state !== stateParam || !code) {
    const response = NextResponse.redirect(buildLoginRedirect(request, { error: "invalid_callback" }));
    clearLogtoCustomerSessionCookies(response);
    return response;
  }

  try {
    const tokens = await exchangeLogtoCodeForTokens(code);
    const userInfo = await fetchLogtoUserInfo(tokens.access_token);
    const bridge = await findOrProvisionCustomerBridge(userInfo);
    const nextPath = sanitizeInternalRedirectPath(stateCookie.nextPath, "/hesap");
    const response = NextResponse.redirect(new URL(nextPath, request.url));
    const sessionPayload = buildLogtoCustomerSessionPayload({
      bridge,
      userInfo,
      idToken: tokens.id_token ?? null,
    });

    clearLogtoCustomerSessionCookies(response);
    writeLogtoCustomerSessionCookie(response, sessionPayload);

    return response;
  } catch (error) {
    console.error("Logto customer callback failed:", error);
    const response = NextResponse.redirect(buildLoginRedirect(request, { error: "login_failed" }));
    clearLogtoCustomerSessionCookies(response);
    return response;
  }
}
