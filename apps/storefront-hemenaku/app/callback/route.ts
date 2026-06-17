import { NextRequest, NextResponse } from "next/server";

function readEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }

  return null;
}

function normalizeUrl(value: string) {
  return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).toString().replace(/\/$/, "");
}

function resolvePublicOrigin(request: NextRequest) {
  const configured = readEnv("NEXT_PUBLIC_SITE_URL", "SITE_URL", "STOREFRONT_URL", "NEXT_PUBLIC_STOREFRONT_URL");
  if (configured) {
    return normalizeUrl(configured);
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (host) {
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    return `${protocol}://${host}`.replace(/\/$/, "");
  }

  return request.nextUrl.origin;
}

function buildLoginRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/giris", resolvePublicOrigin(request));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function parseStateCookie(value: string | undefined) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as { state?: string; nextPath?: string };
    return parsed.state ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizeNextPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/hesap";
  return value;
}

export async function GET(request: NextRequest) {
  const stateCookie = parseStateCookie(request.cookies.get("celebix-customer-logto-state")?.value);
  const stateParam = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");

  if (!stateCookie || !stateParam || stateCookie.state !== stateParam || !code) {
    const response = NextResponse.redirect(buildLoginRedirect(request, { error: "invalid_callback" }));
    response.cookies.set("celebix-customer-logto-state", "", { expires: new Date(0), path: "/" });
    return response;
  }

  const response = NextResponse.redirect(new URL(sanitizeNextPath(stateCookie.nextPath), resolvePublicOrigin(request)));
  response.cookies.set("celebix-customer-logto-state", "", { expires: new Date(0), path: "/" });
  return response;
}
