import "server-only";

import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";

const DEFAULT_LOGTO_ISSUER = "https://auth.celebix.co/oidc";

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

function base64Url(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export interface SelfServeApplicantSession {
  fullName?: string;
  email?: string;
  phone?: string;
}

export function getSelfServeLogtoConfig() {
  return {
    issuer: firstEnv("SELF_SERVE_LOGTO_ISSUER", "LOGTO_ISSUER", "NEXT_PUBLIC_LOGTO_ISSUER") ?? DEFAULT_LOGTO_ISSUER,
    clientId: firstEnv("SELF_SERVE_LOGTO_CLIENT_ID", "LOGTO_CLIENT_ID", "OWNER_LOGTO_CLIENT_ID"),
    redirectUri: firstEnv("SELF_SERVE_LOGTO_REDIRECT_URI"),
    startUrl: firstEnv("SELF_SERVE_LOGTO_START_URL"),
  };
}

export function buildSelfServeLogtoStartUrl(request: Request, returnTo: string) {
  const config = getSelfServeLogtoConfig();
  const safeReturnTo = sanitizeInternalRedirectPath(returnTo, "/onboarding");

  if (config.startUrl) {
    const startUrl = new URL(config.startUrl);
    startUrl.searchParams.set("returnTo", safeReturnTo);
    return { url: startUrl, configured: true };
  }

  if (!config.clientId) {
    const fallbackUrl = new URL("/magaza-ac", request.url);
    fallbackUrl.searchParams.set("auth", "logto_not_configured");
    fallbackUrl.searchParams.set("returnTo", safeReturnTo);
    return { url: fallbackUrl, configured: false };
  }

  const requestUrl = new URL(request.url);
  const redirectUri = config.redirectUri ?? `${requestUrl.origin}/onboarding`;
  const authorizeUrl = new URL(`${config.issuer.replace(/\/$/, "")}/auth`);

  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set("prompt", "login");
  authorizeUrl.searchParams.set("ui_locales", "tr");
  authorizeUrl.searchParams.set(
    "state",
    base64Url({
      flow: "self_serve_onboarding",
      returnTo: safeReturnTo,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
    }),
  );

  return { url: authorizeUrl, configured: true };
}

export function readSelfServeSessionFromHeaders(headers: Headers): SelfServeApplicantSession | null {
  const email =
    headers.get("x-celebix-auth-email") ??
    headers.get("x-auth-request-email") ??
    headers.get("x-forwarded-email") ??
    headers.get("x-logto-email") ??
    headers.get("x-user-email");
  const fullName =
    headers.get("x-celebix-auth-name") ??
    headers.get("x-auth-request-user") ??
    headers.get("x-logto-name") ??
    headers.get("x-user-name");

  if (!email && !fullName) {
    return null;
  }

  return {
    email: email?.trim() || undefined,
    fullName: fullName?.trim() || undefined,
  };
}
