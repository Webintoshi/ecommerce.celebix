import { NextRequest, NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import {
  buildLogtoAuthorizeUrl,
  resolveLogtoCustomerAuthConfig,
  writeLogtoCustomerStateCookie,
  type LogtoFirstScreen,
  type LogtoIdentifier,
} from "@/lib/logto-customer-auth";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const ALLOWED_FIRST_SCREENS = new Set([
  "sign_in",
  "register",
  "reset_password",
  "identifier:sign-in",
  "identifier:register",
] as const);

const ALLOWED_IDENTIFIERS = new Set(["email", "username", "phone"] as const);

function normalizeFirstScreen(value: string | null): LogtoFirstScreen | null {
  if (!value || !ALLOWED_FIRST_SCREENS.has(value as LogtoFirstScreen)) {
    return null;
  }

  return value as LogtoFirstScreen;
}

function normalizeIdentifiers(value: string | null): LogtoIdentifier[] | null {
  if (!value) {
    return null;
  }

  const identifiers = value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry): entry is LogtoIdentifier => ALLOWED_IDENTIFIERS.has(entry as LogtoIdentifier));

  return identifiers.length > 0 ? identifiers : null;
}

function normalizeDirectSignIn(value: string | null): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return /^social:[a-z0-9_-]+$/i.test(normalized) || /^sso:[a-z0-9_-]+$/i.test(normalized)
    ? normalized
    : null;
}

function pendingAuthResponse(reason: string) {
  return NextResponse.json(
    {
      error: "Customer Logto auth kurulumu henuz tamamlanmadi.",
      code: "pending_auth_setup",
      reason,
    },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  if (!isLogtoCustomerAuthEnabled()) {
    return NextResponse.redirect(new URL("/giris", STOREFRONT_RUNTIME.siteUrl));
  }

  const setup = resolveLogtoCustomerAuthConfig();
  if (!setup.configured) {
    return pendingAuthResponse(setup.reason);
  }

  const nextPath = sanitizeInternalRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/hesap",
  );
  const loginHint = request.nextUrl.searchParams.get("login_hint")?.trim() || null;
  const firstScreen = normalizeFirstScreen(request.nextUrl.searchParams.get("firstScreen"));
  const identifier = normalizeIdentifiers(request.nextUrl.searchParams.get("identifier"));
  const directSignIn = normalizeDirectSignIn(
    request.nextUrl.searchParams.get("directSignIn") ??
      request.nextUrl.searchParams.get("direct_sign_in"),
  );

  try {
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
  } catch (error) {
    const reason = error instanceof Error ? error.message : "logto_customer_authorize_failed";
    return pendingAuthResponse(reason);
  }
}
