import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export const CUSTOMER_AUTH_STATUS = "logto_stable";

function readEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim().replace(/^["']|["']$/g, "");
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeUrl(value: string) {
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(normalized).toString().replace(/\/$/, "");
}

export function getLogtoCustomerRuntime() {
  const issuer = readEnv(["LOGTO_CUSTOMER_ISSUER", "NEXT_PUBLIC_LOGTO_CUSTOMER_ISSUER", "LOGTO_ISSUER"]);
  const clientId = readEnv(["LOGTO_CUSTOMER_APP_ID", "NEXT_PUBLIC_LOGTO_CUSTOMER_APP_ID", "LOGTO_APP_ID"]);
  const callbackUrl =
    readEnv(["LOGTO_CUSTOMER_CALLBACK_URL", "LOGTO_CALLBACK_URL"]) ??
    `${STOREFRONT_RUNTIME.siteUrl}/callback`;
  const postLogoutRedirectUrl =
    readEnv(["LOGTO_CUSTOMER_POST_LOGOUT_REDIRECT_URL", "LOGTO_POST_LOGOUT_REDIRECT_URL"]) ??
    `${STOREFRONT_RUNTIME.siteUrl}/giris?next=/hesap&logged_out=1`;

  return {
    enabled: Boolean(issuer && clientId),
    issuer: issuer ? normalizeUrl(issuer) : null,
    clientId,
    callbackUrl: normalizeUrl(callbackUrl),
    postLogoutRedirectUrl: normalizeUrl(postLogoutRedirectUrl),
  };
}

export function getSafeInternalPath(value: string | null | undefined, fallback = "/hesap") {
  if (!value) {
    return fallback;
  }

  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.includes("\\") && !/^\/[a-z][a-z0-9+.-]*:/i.test(decoded)) {
      return decoded;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
