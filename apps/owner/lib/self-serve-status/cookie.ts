import { isOnboardingStatusCredential } from "./credential-codec.ts";

export const ONBOARDING_STATUS_COOKIE = "__Host-celebix_onboarding_status";
export const ONBOARDING_STATUS_TTL_MS = 24 * 60 * 60_000;

export function createOnboardingStatusCookie(credential: string, issuedAt: Date) {
  if (!isOnboardingStatusCredential(credential) || !(issuedAt instanceof Date) || !Number.isFinite(issuedAt.getTime())) {
    throw new Error("onboarding_status_cookie_invalid");
  }
  return Object.freeze({
    name: ONBOARDING_STATUS_COOKIE,
    value: credential,
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONBOARDING_STATUS_TTL_MS / 1_000,
    expires: new Date(issuedAt.getTime() + ONBOARDING_STATUS_TTL_MS),
  });
}

export function readOnboardingStatusCookie(headers: Headers): string | null {
  const header = headers.get("cookie");
  if (!header || header.length > 16_384) return null;
  const values = header.split(";").flatMap((part) => {
    const item = part.trim();
    const separator = item.indexOf("=");
    return separator > 0 && item.slice(0, separator) === ONBOARDING_STATUS_COOKIE ? [item.slice(separator + 1)] : [];
  });
  return values.length === 1 && isOnboardingStatusCredential(values[0]) ? values[0] : null;
}
