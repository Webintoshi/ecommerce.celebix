import "server-only";

import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const LOGTO_CUSTOMER_STATE_COOKIE_NAME = "celebix-customer-logto-state";
const LOGTO_CUSTOMER_SESSION_COOKIE_NAME = "celebix-customer-logto-session";
const LOGTO_CUSTOMER_STATE_MAX_AGE = 10 * 60;

type CookieValue = {
  name: string;
  value: string;
};

type LogtoDiscoveryDocument = {
  authorization_endpoint: string;
  end_session_endpoint?: string;
};

type LogtoCustomerAuthConfig = {
  issuer: string;
  clientId: string;
  callbackUrl: string;
  postLogoutRedirectUrl: string;
};

export type LogtoFirstScreen =
  | "sign_in"
  | "register"
  | "reset_password"
  | "identifier:sign-in"
  | "identifier:register";

export type LogtoIdentifier = "email" | "username" | "phone";

export type LogtoCustomerStatePayload = {
  state: string;
  nextPath: string;
  issuedAt: string;
};

export type BuildLogtoAuthorizeOptions = {
  nextPath: string;
  firstScreen?: LogtoFirstScreen | null;
  identifier?: LogtoIdentifier[] | null;
  loginHint?: string | null;
  directSignIn?: string | null;
};

function readEnv(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim().replace(/^["']|["']$/g, "");
    if (value) {
      return value;
    }
  }

  return null;
}

function normalizeUrl(value: string): string {
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(normalized).toString().replace(/\/$/, "");
}

function normalizePublicRedirectUrl(value: string): string {
  const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(normalized).toString();
}

function isUnsafePublicRedirectUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();

    return (
      parsed.protocol !== "https:" ||
      parsed.port === "3000" ||
      hostname === "localhost" ||
      hostname === "0.0.0.0" ||
      hostname === "127.0.0.1"
    );
  } catch {
    return true;
  }
}

function isPlaceholderClientId(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return (
    !normalized ||
    normalized.startsWith("configure-") ||
    normalized.includes("placeholder") ||
    normalized.includes("pending") ||
    normalized.includes("changeme") ||
    normalized.includes("replace-me")
  );
}

function resolveLogtoIssuer(): string | null {
  const explicitIssuer = readEnv([
    "LOGTO_CUSTOMER_ISSUER",
    "NEXT_PUBLIC_LOGTO_CUSTOMER_ISSUER",
    "LOGTO_ISSUER",
    "NEXT_PUBLIC_LOGTO_ISSUER",
  ]);

  if (explicitIssuer) {
    return normalizeUrl(explicitIssuer);
  }

  const endpoint = readEnv(["LOGTO_ENDPOINT", "NEXT_PUBLIC_LOGTO_ENDPOINT"]);
  if (!endpoint) {
    return null;
  }

  const parsed = new URL(normalizeUrl(endpoint));
  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/oidc";
  }

  return parsed.toString().replace(/\/$/, "");
}

export function resolveLogtoCustomerAuthConfig():
  | { configured: true; config: LogtoCustomerAuthConfig }
  | { configured: false; reason: string } {
  const issuer = resolveLogtoIssuer();
  if (!issuer) {
    return { configured: false, reason: "missing_logto_customer_issuer" };
  }

  const clientId = readEnv([
    "LOGTO_CUSTOMER_APP_ID",
    "NEXT_PUBLIC_LOGTO_CUSTOMER_APP_ID",
    "LOGTO_APP_ID",
  ]);
  if (!clientId || isPlaceholderClientId(clientId)) {
    return { configured: false, reason: "missing_logto_customer_app_id" };
  }

  const callbackUrl = normalizePublicRedirectUrl(
    readEnv(["LOGTO_CUSTOMER_CALLBACK_URL", "LOGTO_CALLBACK_URL"]) ??
      `${STOREFRONT_RUNTIME.siteUrl}/callback`,
  );
  if (isUnsafePublicRedirectUrl(callbackUrl)) {
    return { configured: false, reason: "unsafe_logto_customer_callback_url" };
  }

  const postLogoutRedirectUrl = normalizePublicRedirectUrl(
    readEnv(["LOGTO_CUSTOMER_POST_LOGOUT_REDIRECT_URL", "LOGTO_POST_LOGOUT_REDIRECT_URL"]) ??
      `${STOREFRONT_RUNTIME.siteUrl}/giris?next=/hesap&logged_out=1`,
  );
  if (isUnsafePublicRedirectUrl(postLogoutRedirectUrl)) {
    return { configured: false, reason: "unsafe_logto_customer_post_logout_url" };
  }

  return {
    configured: true,
    config: {
      issuer,
      clientId,
      callbackUrl,
      postLogoutRedirectUrl,
    },
  };
}

function getCookieOptions(maxAge: number) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: STOREFRONT_RUNTIME.siteUrl.startsWith("https://"),
    maxAge,
  };
}

function encodeStatePayload(payload: LogtoCustomerStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeStatePayload(value: string): LogtoCustomerStatePayload | null {
  try {
    const payload = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<LogtoCustomerStatePayload>;

    if (!payload.state || !payload.nextPath || !payload.issuedAt) {
      return null;
    }

    return {
      state: payload.state,
      nextPath: sanitizeInternalRedirectPath(payload.nextPath, "/hesap"),
      issuedAt: payload.issuedAt,
    };
  } catch {
    return null;
  }
}

function createStatePayload(nextPath: string): LogtoCustomerStatePayload {
  return {
    state: randomBytes(24).toString("base64url"),
    nextPath: sanitizeInternalRedirectPath(nextPath, "/hesap"),
    issuedAt: new Date().toISOString(),
  };
}

export function writeLogtoCustomerStateCookie(
  response: NextResponse,
  payload: LogtoCustomerStatePayload,
) {
  response.cookies.set(
    LOGTO_CUSTOMER_STATE_COOKIE_NAME,
    encodeStatePayload(payload),
    getCookieOptions(LOGTO_CUSTOMER_STATE_MAX_AGE),
  );
}

export function readLogtoCustomerStateCookie(cookies: CookieValue[]) {
  const rawValue = cookies.find((cookie) => cookie.name === LOGTO_CUSTOMER_STATE_COOKIE_NAME)?.value;
  return rawValue ? decodeStatePayload(rawValue) : null;
}

export function clearLogtoCustomerSessionCookies(response: NextResponse) {
  response.cookies.set(LOGTO_CUSTOMER_STATE_COOKIE_NAME, "", {
    ...getCookieOptions(0),
    maxAge: 0,
  });
  response.cookies.set(LOGTO_CUSTOMER_SESSION_COOKIE_NAME, "", {
    ...getCookieOptions(0),
    maxAge: 0,
  });
}

async function getLogtoDiscoveryDocument(
  config: LogtoCustomerAuthConfig,
): Promise<LogtoDiscoveryDocument> {
  const response = await fetch(`${config.issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Logto customer discovery failed with status ${response.status}`);
  }

  return (await response.json()) as LogtoDiscoveryDocument;
}

export async function buildLogtoAuthorizeUrl(options: BuildLogtoAuthorizeOptions) {
  const setup = resolveLogtoCustomerAuthConfig();
  if (!setup.configured) {
    throw new Error(setup.reason);
  }

  const discovery = await getLogtoDiscoveryDocument(setup.config);
  const statePayload = createStatePayload(options.nextPath);
  const url = new URL(discovery.authorization_endpoint);

  url.searchParams.set("client_id", setup.config.clientId);
  url.searchParams.set("redirect_uri", setup.config.callbackUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", statePayload.state);

  if (options.firstScreen) {
    url.searchParams.set("first_screen", options.firstScreen);
  }

  if (options.identifier && options.identifier.length > 0) {
    url.searchParams.set("identifier", options.identifier.join(" "));
  }

  if (options.loginHint) {
    url.searchParams.set("login_hint", options.loginHint);
  }

  if (options.directSignIn) {
    url.searchParams.set("direct_sign_in", options.directSignIn);
  }

  return {
    url,
    statePayload,
  };
}

export async function getLogtoLogoutRedirectUrl(
  idTokenHint: string | null,
  options?: { postLogoutRedirectUrl?: string | null },
) {
  const setup = resolveLogtoCustomerAuthConfig();
  if (!setup.configured) {
    throw new Error(setup.reason);
  }

  const discovery = await getLogtoDiscoveryDocument(setup.config);
  const postLogoutRedirectUrl = normalizePublicRedirectUrl(
    options?.postLogoutRedirectUrl ?? setup.config.postLogoutRedirectUrl,
  );

  if (!discovery.end_session_endpoint) {
    return postLogoutRedirectUrl;
  }

  const url = new URL(discovery.end_session_endpoint);
  url.searchParams.set("client_id", setup.config.clientId);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUrl);

  if (idTokenHint) {
    url.searchParams.set("id_token_hint", idTokenHint);
  }

  return url.toString();
}
