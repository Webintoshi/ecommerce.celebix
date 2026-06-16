import { NextRequest, NextResponse } from "next/server";

function buildLoginRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/giris", request.url);
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

  const response = NextResponse.redirect(new URL(sanitizeNextPath(stateCookie.nextPath), request.url));
  response.cookies.set("celebix-customer-logto-state", "", { expires: new Date(0), path: "/" });
  return response;
}
