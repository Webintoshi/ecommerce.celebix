import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED_FIRST_SCREENS = new Set([
  "sign_in",
  "register",
  "reset_password",
  "identifier:sign-in",
  "identifier:register",
]);

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }

  return null;
}

function normalizeIssuer(value: string) {
  return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).toString().replace(/\/$/, "");
}

function resolvePublicOrigin(request: NextRequest) {
  const configured = readEnv("NEXT_PUBLIC_SITE_URL", "SITE_URL", "STOREFRONT_URL", "NEXT_PUBLIC_STOREFRONT_URL");
  if (configured) {
    return normalizeIssuer(configured);
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    return `${protocol}://${host}`.replace(/\/$/, "");
  }

  return request.nextUrl.origin;
}

function resolveAuthorizeEndpoint() {
  const issuer = readEnv(
    "LOGTO_CUSTOMER_ISSUER",
    "NEXT_PUBLIC_LOGTO_CUSTOMER_ISSUER",
    "LOGTO_ISSUER",
    "NEXT_PUBLIC_LOGTO_ISSUER",
    "LOGTO_ENDPOINT",
  );
  if (!issuer) return null;

  const normalized = normalizeIssuer(issuer);
  return normalized.endsWith("/oidc") ? `${normalized}/auth` : `${normalized}/oidc/auth`;
}

function resolveClientId() {
  return readEnv("LOGTO_CUSTOMER_APP_ID", "NEXT_PUBLIC_LOGTO_CUSTOMER_APP_ID", "LOGTO_APP_ID", "NEXT_PUBLIC_LOGTO_APP_ID");
}

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/hesap";
  return value;
}

function normalizeDirectSignIn(request: NextRequest) {
  const explicit = request.nextUrl.searchParams.get("directSignIn")?.trim();
  if (explicit && (/^social:[a-z0-9_-]+$/i.test(explicit) || /^sso:[a-z0-9_-]+$/i.test(explicit))) {
    return explicit;
  }

  const provider = request.nextUrl.searchParams.get("provider")?.trim().toLowerCase();
  return provider === "google" ? "social:google" : null;
}

export async function GET(request: NextRequest) {
  const authorizeEndpoint = resolveAuthorizeEndpoint();
  const clientId = resolveClientId();
  const publicOrigin = resolvePublicOrigin(request);

  if (!authorizeEndpoint || !clientId) {
    return NextResponse.redirect(new URL("/giris?error=auth_not_configured", publicOrigin));
  }

  const state = randomBytes(18).toString("base64url");
  const url = new URL(authorizeEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", new URL("/callback", publicOrigin).toString());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);

  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const firstScreen = request.nextUrl.searchParams.get("firstScreen");
  const loginHint = request.nextUrl.searchParams.get("login_hint")?.trim();
  const directSignIn = normalizeDirectSignIn(request);

  if (firstScreen && ALLOWED_FIRST_SCREENS.has(firstScreen)) {
    url.searchParams.set("first_screen", firstScreen);
  }

  if (loginHint) {
    url.searchParams.set("login_hint", loginHint);
  }

  if (directSignIn) {
    url.searchParams.set("direct_sign_in", directSignIn);
  }

  const response = NextResponse.redirect(url);
  response.cookies.set("celebix-customer-logto-state", JSON.stringify({ state, nextPath }), {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: publicOrigin.startsWith("https://"),
  });

  return response;
}
