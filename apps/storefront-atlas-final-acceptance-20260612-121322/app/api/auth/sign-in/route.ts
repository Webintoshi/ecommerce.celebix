import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getLogtoCustomerRuntime, getSafeInternalPath } from "@/lib/customer-auth-runtime";

const ALLOWED_FIRST_SCREENS = new Set([
  "sign_in",
  "register",
  "reset_password",
  "identifier:sign-in",
  "identifier:register",
]);

const ALLOWED_IDENTIFIERS = new Set(["email", "username", "phone"]);

function readAllowedValue(value: string | null, allowed: Set<string>) {
  const normalized = value?.trim();
  return normalized && allowed.has(normalized) ? normalized : null;
}

function readIdentifier(value: string | null) {
  const normalized = value?.trim();
  return normalized && ALLOWED_IDENTIFIERS.has(normalized) ? normalized : null;
}

function readDirectSignIn(value: string | null) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return /^social:[a-z0-9_-]+$/i.test(normalized) || /^sso:[a-z0-9_-]+$/i.test(normalized)
    ? normalized
    : null;
}

export async function GET(request: NextRequest) {
  const runtime = getLogtoCustomerRuntime();
  if (!runtime.enabled || !runtime.issuer || !runtime.clientId) {
    return NextResponse.json({ error: "customer_auth_pending" }, { status: 503 });
  }

  const authorizeUrl = new URL(`${runtime.issuer}/auth`);
  authorizeUrl.searchParams.set("client_id", runtime.clientId);
  authorizeUrl.searchParams.set("redirect_uri", runtime.callbackUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email offline_access");
  authorizeUrl.searchParams.set("state", randomUUID());

  const nextPath = getSafeInternalPath(request.nextUrl.searchParams.get("next"));
  authorizeUrl.searchParams.set("app_state", JSON.stringify({ next: nextPath }));

  const firstScreen = readAllowedValue(request.nextUrl.searchParams.get("firstScreen"), ALLOWED_FIRST_SCREENS);
  if (firstScreen) {
    authorizeUrl.searchParams.set("first_screen", firstScreen);
  }

  const identifier = readIdentifier(request.nextUrl.searchParams.get("identifier"));
  if (identifier) {
    authorizeUrl.searchParams.set("identifier", identifier);
  }

  const directSignIn = readDirectSignIn(request.nextUrl.searchParams.get("directSignIn"));
  if (directSignIn) {
    authorizeUrl.searchParams.set("direct_sign_in", directSignIn);
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("celebix-customer-logto-next", nextPath, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    maxAge: 600,
  });

  return response;
}
