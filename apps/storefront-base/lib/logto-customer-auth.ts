import "server-only";

import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { resolveCustomerAuthMode } from "@/lib/customer-auth-mode";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const LOGTO_CUSTOMER_STATE_COOKIE_NAME = "celebix-customer-logto-state";
const LOGTO_CUSTOMER_STATE_MAX_AGE = 10 * 60;

type LogtoDiscoveryDocument = {
  authorization_endpoint: string;
  end_session_endpoint?: string;
};

type LogtoCustomerStatePayload = {
  version: 1;
  state: string;
  nextPath: string;
  issuedAt: string;
};

type CustomerAuthorizeOptions = {
  directSignIn?: string | null;
  firstScreen?: string | null;
  identifier?: string | null;
  loginHint?: string | null;
};

function readOptionalEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
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

function getRequestOrigin(requestUrl: string) {
  const parsed = new URL(requestUrl);
  return `${parsed.protocol}//${parsed.host}`;
}

function getLogtoCustomerIssuer(): string | null {
  const issuer = readOptionalEnv(
    "LOGTO_CUSTOMER_ISSUER",
    "NEXT_PUBLIC_LOGTO_CUSTOMER_ISSUER",
    "LOGTO_ISSUER",
    "NEXT_PUBLIC_LOGTO_ISSUER",
  );

  return issuer ? normalizeUrl(issuer) : null;
}

function getLogtoCustomerAppId(): string | null {
  return readOptionalEnv("LOGTO_CUSTOMER_APP_ID", "NEXT_PUBLIC_LOGTO_CUSTOMER_APP_ID");
}

function getLogtoCustomerCallbackUrl(requestUrl: string): string {
  return normalizeUrl(
    readOptionalEnv("LOGTO_CUSTOMER_CALLBACK_URL") ?? `${getRequestOrigin(requestUrl)}/callback`,
  );
}

function getLogtoCustomerPostLogoutRedirectUrl(requestUrl: string, nextPath?: string | null): string {
  const origin = getRequestOrigin(requestUrl);
  const safeNextPath = sanitizeInternalRedirectPath(nextPath, "/");

  return normalizeUrl(
    readOptionalEnv("LOGTO_CUSTOMER_POST_LOGOUT_REDIRECT_URL") ?? `${origin}${safeNextPath}`,
  );
}

function createLogtoCustomerStatePayload(nextPath: string): LogtoCustomerStatePayload {
  return {
    version: 1,
    state: randomBytes(24).toString("base64url"),
    nextPath: sanitizeInternalRedirectPath(nextPath, "/hesap"),
    issuedAt: new Date().toISOString(),
  };
}

function encodeStatePayload(payload: LogtoCustomerStatePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function isLogtoCustomerAuthEnabled(): boolean {
  return resolveCustomerAuthMode() === "logto" && Boolean(getLogtoCustomerIssuer() && getLogtoCustomerAppId());
}

export async function getLogtoCustomerDiscoveryDocument(): Promise<LogtoDiscoveryDocument> {
  const issuer = getLogtoCustomerIssuer();

  if (!issuer) {
    throw new Error("LOGTO_CUSTOMER_ISSUER is not configured");
  }

  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Logto customer discovery failed with status ${response.status}`);
  }

  return (await response.json()) as LogtoDiscoveryDocument;
}

export async function buildLogtoCustomerAuthorizeUrl(
  requestUrl: string,
  nextPath: string,
  options: CustomerAuthorizeOptions = {},
) {
  const appId = getLogtoCustomerAppId();

  if (!appId) {
    throw new Error("LOGTO_CUSTOMER_APP_ID is not configured");
  }

  const discovery = await getLogtoCustomerDiscoveryDocument();
  const statePayload = createLogtoCustomerStatePayload(nextPath);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", getLogtoCustomerCallbackUrl(requestUrl));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", statePayload.state);
  url.searchParams.set("ui_locales", "tr");

  if (options.firstScreen) {
    url.searchParams.set("first_screen", options.firstScreen);
  }

  if (options.identifier) {
    url.searchParams.set("identifier", options.identifier);
  }

  if (options.directSignIn) {
    url.searchParams.set("direct_sign_in", options.directSignIn);
  }

  if (options.loginHint) {
    url.searchParams.set("login_hint", options.loginHint);
  }

  return {
    url,
    statePayload,
  };
}

export async function getLogtoCustomerLogoutRedirectUrl(requestUrl: string, nextPath?: string | null) {
  const discovery = await getLogtoCustomerDiscoveryDocument();
  const fallback = getLogtoCustomerPostLogoutRedirectUrl(requestUrl, nextPath);

  if (!discovery.end_session_endpoint) {
    return new URL(fallback);
  }

  const logoutUrl = new URL(discovery.end_session_endpoint);
  const appId = getLogtoCustomerAppId();
  if (appId) {
    logoutUrl.searchParams.set("client_id", appId);
  }
  logoutUrl.searchParams.set("post_logout_redirect_uri", fallback);

  return logoutUrl;
}

export function writeLogtoCustomerStateCookie(response: NextResponse, payload: LogtoCustomerStatePayload) {
  response.cookies.set(LOGTO_CUSTOMER_STATE_COOKIE_NAME, encodeStatePayload(payload), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: STOREFRONT_RUNTIME.siteUrl.startsWith("https://"),
    maxAge: LOGTO_CUSTOMER_STATE_MAX_AGE,
  });

  return payload;
}
