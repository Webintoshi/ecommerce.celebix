import type { NextResponse } from "next/server";

type CookieLike = {
  name: string;
};

const OWNER_AUTH_COOKIE_PREFIXES = ["sb-", "supabase-auth-token"];

export function isOwnerAuthCookie(name: string): boolean {
  return OWNER_AUTH_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function hasOwnerAuthCookies(cookies: CookieLike[]): boolean {
  return cookies.some((cookie) => isOwnerAuthCookie(cookie.name));
}

export function expireOwnerAuthCookies(
  response: NextResponse,
  cookies: CookieLike[],
): NextResponse {
  for (const cookie of cookies) {
    if (!isOwnerAuthCookie(cookie.name)) {
      continue;
    }

    response.cookies.set(cookie.name, "", {
      expires: new Date(0),
      path: "/",
    });
  }

  return response;
}
