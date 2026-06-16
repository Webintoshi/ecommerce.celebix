import { NextRequest, NextResponse } from "next/server";

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

function resolveLogoutEndpoint() {
  const issuer = readEnv("LOGTO_ISSUER", "NEXT_PUBLIC_LOGTO_ISSUER", "LOGTO_ENDPOINT");
  if (!issuer) return null;

  const normalized = normalizeIssuer(issuer);
  return normalized.endsWith("/oidc") ? `${normalized}/session/end` : `${normalized}/oidc/session/end`;
}

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/giris?next=/hesap&logged_out=1";
  return value;
}

export async function GET(request: NextRequest) {
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const logoutEndpoint = resolveLogoutEndpoint();
  const fallbackUrl = new URL(nextPath, request.url);
  const targetUrl = logoutEndpoint ? new URL(logoutEndpoint) : fallbackUrl;

  if (logoutEndpoint) {
    targetUrl.searchParams.set("post_logout_redirect_uri", fallbackUrl.toString());
  }

  const response = NextResponse.redirect(targetUrl);
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("celebix-customer-") || cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, "", { expires: new Date(0), path: "/" });
    }
  }

  return response;
}
