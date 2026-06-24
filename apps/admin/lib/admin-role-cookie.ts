import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type { UserRole } from "@/lib/permissions";

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

function readEnvValue(name: string): string | null {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  return value || null;
}

function getAdminRoleCookieSigningSecret(): string {
  const secret =
    readEnvValue("SUPABASE_SERVICE_ROLE_KEY") ??
    readEnvValue("ADMIN_COOKIE_SECRET") ??
    readEnvValue("LOGTO_COOKIE_SECRET");

  if (!secret) {
    throw new Error("Admin role cookie signing secret is not configured");
  }

  return secret;
}

function isSecureAdminRuntime(): boolean {
  const url =
    readEnvValue("NEXT_PUBLIC_ADMIN_URL") ??
    readEnvValue("ADMIN_URL") ??
    readEnvValue("NEXT_PUBLIC_SUPABASE_URL");

  return url ? url.startsWith("https://") : true;
}

function getAdminRoleCookieOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: isSecureAdminRuntime(),
    maxAge: ADMIN_ROLE_COOKIE_MAX_AGE,
  };
}

function signValue(payload: string): string {
  return createHmac("sha256", getAdminRoleCookieSigningSecret())
    .update(payload)
    .digest("base64url");
}

function encodePayload(payload: AdminRoleCookiePayload): string {
  const serialized = JSON.stringify(payload);
  const encoded = Buffer.from(serialized, "utf8").toString("base64url");
  return `${encoded}.${signValue(encoded)}`;
}

function decodePayload(value: string): AdminRoleCookiePayload | null {
  const separatorIndex = value.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const encoded = value.slice(0, separatorIndex);
  const providedSignature = value.slice(separatorIndex + 1);
  const expectedSignature = signValue(encoded);

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
