import "server-only";

import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";

const DEFAULT_LOGTO_ISSUER = "https://auth.celebix.co/oidc";
const DEFAULT_OWNER_PUBLIC_URL = "https://ecommerce.celebix.co";
const RECOGNIZED_OWNER_PUBLIC_HOSTS = new Set(["ecommerce.celebix.co"]);
const OWNER_PUBLIC_URL_ENV_NAMES = [
  "OWNER_PUBLIC_URL",
  "NEXT_PUBLIC_OWNER_URL",
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "PUBLIC_BASE_URL",
  "SELF_SERVE_PUBLIC_URL",
];
const LOCALHOST_NAMES = new Set(["localhost"]);
const FORBIDDEN_PUBLIC_HOSTS = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "::1",
  "[::1]",
]);

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

function isDevelopmentRuntime() {
  return process.env.NODE_ENV !== "production";
}

function readForwardedHost(request: Request) {
  const forwardedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("x-original-host") ??
    request.headers.get("host");

  return forwardedHost?.split(",")[0]?.trim() ?? null;
}

function readForwardedProtocol(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  return forwardedProtocol === "http" || forwardedProtocol === "https" ? forwardedProtocol : null;
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase();
}

function isForbiddenPublicHostname(hostname: string) {
  const normalized = normalizeHostname(hostname);

  return (
    FORBIDDEN_PUBLIC_HOSTS.has(normalized) ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function isAllowedEnvPublicUrl(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  if (!isDevelopmentRuntime() && url.protocol !== "https:") {
    return false;
  }

  if (isForbiddenPublicHostname(url.hostname)) {
    return false;
  }

  if (!isDevelopmentRuntime() && (LOCALHOST_NAMES.has(normalizeHostname(url.hostname)) || url.port === "3100")) {
    return false;
  }

  return true;
}

function isAllowedRequestPublicUrl(url: URL) {
  const hostname = normalizeHostname(url.hostname);

  if (RECOGNIZED_OWNER_PUBLIC_HOSTS.has(hostname)) {
    return true;
  }

  return isDevelopmentRuntime() && LOCALHOST_NAMES.has(hostname);
}

function normalizeLocalDevelopmentUrl(url: URL) {
  if (isDevelopmentRuntime() && normalizeHostname(url.hostname) === "0.0.0.0") {
    url.hostname = "localhost";
  }

  return url;
}

function readEnvPublicBaseUrl() {
  for (const name of OWNER_PUBLIC_URL_ENV_NAMES) {
    const value = process.env[name]?.trim();

    if (!value) {
      continue;
    }

    try {
      const url = new URL(value);
      url.pathname = "/";
      url.search = "";
      url.hash = "";

      if (isAllowedEnvPublicUrl(url)) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function readRequestPublicBaseUrl(request: Request) {
  const forwardedHost = readForwardedHost(request);

  if (forwardedHost) {
    const protocol = isDevelopmentRuntime() ? readForwardedProtocol(request) ?? "http" : "https";

    try {
      const forwardedUrl = normalizeLocalDevelopmentUrl(new URL(`${protocol}://${forwardedHost}`));

      if (isAllowedRequestPublicUrl(forwardedUrl)) {
        return forwardedUrl;
      }
    } catch {
      // Ignore malformed proxy headers and continue to request.url fallback.
    }
  }

  try {
    const requestUrl = normalizeLocalDevelopmentUrl(new URL(request.url));

    if (isAllowedRequestPublicUrl(requestUrl)) {
      return new URL(requestUrl.origin);
    }
  } catch {
    return null;
  }

  return null;
}

export function resolveSelfServePublicBaseUrl(request: Request) {
  return readEnvPublicBaseUrl() ?? readRequestPublicBaseUrl(request);
}

export function buildSelfServeOwnerPublicUrl(request: Request, pathname: string) {
  const baseUrl = resolveSelfServePublicBaseUrl(request) ?? new URL(DEFAULT_OWNER_PUBLIC_URL);

  return new URL(pathname, baseUrl);
}

function isForbiddenProductionRedirect(url: URL) {
  if (isDevelopmentRuntime()) {
    return normalizeHostname(url.hostname) === "0.0.0.0";
  }

  return (
    isForbiddenPublicHostname(url.hostname) ||
    LOCALHOST_NAMES.has(normalizeHostname(url.hostname)) ||
    url.port === "3100"
  );
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
    try {
      const startUrl = new URL(config.startUrl);

      if (!isForbiddenProductionRedirect(startUrl)) {
        startUrl.searchParams.set("returnTo", safeReturnTo);
        return { url: startUrl, configured: true };
      }
    } catch {
      // Fall through to the fail-closed owner URL below.
    }

    const fallbackUrl = buildSelfServeOwnerPublicUrl(request, "/magaza-ac");
    fallbackUrl.searchParams.set("auth", "owner_public_url_not_configured");
    fallbackUrl.searchParams.set("returnTo", safeReturnTo);
    return { url: fallbackUrl, configured: false };
  }

  if (!config.clientId) {
    const fallbackUrl = buildSelfServeOwnerPublicUrl(request, "/magaza-ac");
    fallbackUrl.searchParams.set("auth", "logto_not_configured");
    fallbackUrl.searchParams.set("returnTo", safeReturnTo);
    return { url: fallbackUrl, configured: false };
  }

  const publicBaseUrl = resolveSelfServePublicBaseUrl(request);

  if (!publicBaseUrl && !config.redirectUri) {
    const fallbackUrl = buildSelfServeOwnerPublicUrl(request, "/magaza-ac");
    fallbackUrl.searchParams.set("auth", "owner_public_url_not_configured");
    fallbackUrl.searchParams.set("returnTo", safeReturnTo);
    return { url: fallbackUrl, configured: false };
  }

  const redirectUri = config.redirectUri ?? new URL("/onboarding", publicBaseUrl ?? DEFAULT_OWNER_PUBLIC_URL).toString();
  const authorizeUrl = new URL(`${config.issuer.replace(/\/$/, "")}/auth`);

  try {
    if (!isForbiddenProductionRedirect(new URL(redirectUri))) {
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
  } catch {
    // Fall through to a safe owner URL when redirect URI config is malformed.
  }

  {
    const fallbackUrl = buildSelfServeOwnerPublicUrl(request, "/magaza-ac");
    fallbackUrl.searchParams.set("auth", "owner_public_url_not_configured");
    fallbackUrl.searchParams.set("returnTo", safeReturnTo);
    return { url: fallbackUrl, configured: false };
  }
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
