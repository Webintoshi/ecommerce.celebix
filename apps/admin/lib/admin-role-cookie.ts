import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type { UserRole } from "@/lib/permissions";
import {
  getOptionalSupabaseServiceRoleKey,
  shouldUseSecureSupabaseCookies,
} from "./supabase-shared";

const ADMIN_ROLE_COOKIE_NAME = "celebix-admin-role";
const ADMIN_ROLE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

type CookieValue = {
  name: string;
  value: string;
};

export type AdminRoleCookiePayload = {
  userId: string;
  role: UserRole;
};

function getAdminRoleCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: shouldUseSecureSupabaseCookies(),
    maxAge: ADMIN_ROLE_COOKIE_MAX_AGE,
  };
}

function signValue(payload: string): string | null {
  const signingKey = getOptionalSupabaseServiceRoleKey();

  if (!signingKey) {
    return null;
  }

  return createHmac("sha256", signingKey)
    .update(payload)
    .digest("base64url");
}

function encodePayload(payload: AdminRoleCookiePayload): string {
  const serialized = JSON.stringify(payload);
  const encoded = Buffer.from(serialized, "utf8").toString("base64url");
  const signature = signValue(encoded);

  if (!signature) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }

  return `${encoded}.${signature}`;
}

function decodePayload(value: string): AdminRoleCookiePayload | null {
  const separatorIndex = value.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const encoded = value.slice(0, separatorIndex);
  const providedSignature = value.slice(separatorIndex + 1);
  const expectedSignature = signValue(encoded);

  if (!expectedSignature) {
    return null;
  }

  try {
    const provided = Buffer.from(providedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminRoleCookiePayload;
    return payload?.userId && payload?.role ? payload : null;
  } catch {
    return null;
  }
}

export function writeAdminRoleCookie(response: NextResponse, payload: AdminRoleCookiePayload) {
  response.cookies.set(ADMIN_ROLE_COOKIE_NAME, encodePayload(payload), getAdminRoleCookieOptions());
}

export function clearAdminRoleCookie(response: NextResponse) {
  response.cookies.set(ADMIN_ROLE_COOKIE_NAME, "", { ...getAdminRoleCookieOptions(), maxAge: 0 });
}

export function readAdminRoleCookie(cookies: CookieValue[]): AdminRoleCookiePayload | null {
  const rawValue = cookies.find((cookie) => cookie.name === ADMIN_ROLE_COOKIE_NAME)?.value;

  if (!rawValue) {
    return null;
  }

  return decodePayload(rawValue);
}
