import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  buildLogtoAuthorizeUrl,
  writeLogtoCustomerStateCookie,
} from "@/lib/logto-customer-auth";

const ALLOWED_FIRST_SCREENS = new Set([
  "sign_in",
  "register",
  "reset_password",
  "identifier:sign-in",
  "identifier:register",
] as const);

const ALLOWED_IDENTIFIERS = new Set(["email", "username", "phone"] as const);

function normalizeFirstScreen(value: string | null) {
  if (!value || !ALLOWED_FIRST_SCREENS.has(value as never)) {
    return null;
  }

  return value as
    | "sign_in"
    | "register"
    | "reset_password"
    | "identifier:sign-in"
    | "identifier:register";
}

function normalizeIdentifiers(value: string | null) {
  if (!value) {
    return null;
  }

  const identifiers = value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry): entry is "email" | "username" | "phone" => ALLOWED_IDENTIFIERS.has(entry as never));

  return identifiers.length > 0 ? identifiers : null;
}

function normalizeDirectSignIn(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return /^social:[a-z0-9_-]+$/i.test(normalized) || /^sso:[a-z0-9_-]+$/i.test(normalized)
    ? normalized
    : null;
}

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(new URL("/giris", request.url));
  }

  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/hesap",
  );
  const loginHint = request.nextUrl.searchParams.get("login_hint")?.trim() || null;
  const firstScreen = normalizeFirstScreen(request.nextUrl.searchParams.get("firstScreen"));
  const identifier = normalizeIdentifiers(request.nextUrl.searchParams.get("identifier"));
  const directSignIn = normalizeDirectSignIn(request.nextUrl.searchParams.get("directSignIn"));
  const { url, statePayload } = await buildLogtoAuthorizeUrl({
    nextPath,
    firstScreen,
    identifier,
    loginHint,
    directSignIn,
  });
  const response = NextResponse.redirect(url);

  writeLogtoCustomerStateCookie(response, statePayload);

  return response;
}
