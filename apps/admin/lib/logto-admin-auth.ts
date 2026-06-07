import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import { queryAdminLightPostgresOne } from "@/lib/db/light-postgres-client";
import type { UserRole } from "@/lib/permissions";
import { STORE_RUNTIME } from "@/lib/store-runtime";

const LOGTO_ADMIN_SESSION_COOKIE_NAME = "celebix-admin-logto-session";
const LOGTO_ADMIN_STATE_COOKIE_NAME = "celebix-admin-logto-state";
const LOGTO_ADMIN_SESSION_MAX_AGE = 8 * 60 * 60;
const LOGTO_ADMIN_STATE_MAX_AGE = 10 * 60;
const ADMIN_ROLES = new Set<UserRole>([
  "super_admin",
  "product_manager",
  "content_creator",
  "order_manager",
]);

type CookieValue = {
  name: string;
  value: string;
};

type LogtoDiscoveryDocument = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
};

type LogtoTokenResponse = {
  access_token: string;
  id_token?: string;
};

type LogtoUserInfo = {
  sub: string;
  email?: string;
  name?: string;
  username?: string;
  preferred_username?: string;
};

type LogtoAdminBridgeRecord = {
  userId: string;
  email: string | null;
  fullName: string | null;
  role: UserRole;
  taskDefinition: string | null;
  providerSubject: string;
};

type SignedCookiePayload = {
  version: 1;
};

export type LogtoAdminSessionPayload = SignedCookiePayload & {
  userId: string;
  subject: string;
  email: string;
  fullName: string | null;
  username: string | null;
  role: UserRole;
  idToken: string | null;
  issuedAt: string;
};

type LogtoAdminStatePayload = SignedCookiePayload & {
  state: string;
  nextPath: string;
  issuedAt: string;
};

function readRequiredEnv(name: string, value: string | undefined): string {
  const normalized = value?.trim().replace(/^["']|["']$/g, "");

  if (!normalized) {
    throw new Error(`${name} is not configured`);
  }

  return normalized;
}

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

function getCookieSigningSecret() {
  return readRequiredEnv("LOGTO_COOKIE_SECRET", process.env.LOGTO_COOKIE_SECRET);
}

function getLogtoAppId() {
  return readRequiredEnv(
    "LOGTO_ADMIN_APP_ID",
    readOptionalEnv("LOGTO_ADMIN_APP_ID", "LOGTO_APP_ID") ?? undefined,
  );
}

function getLogtoAppSecret() {
  return readRequiredEnv(
    "LOGTO_ADMIN_APP_SECRET",
    readOptionalEnv("LOGTO_ADMIN_APP_SECRET", "LOGTO_APP_SECRET") ?? undefined,
  );
}

export function getOptionalLogtoIssuer(): string | null {
  const explicitIssuer = readOptionalEnv("LOGTO_ISSUER");
  if (explicitIssuer) {
    return normalizeUrl(explicitIssuer);
  }

  const endpoint = readOptionalEnv("LOGTO_ENDPOINT");
  if (!endpoint) {
    return null;
  }

  const parsed = new URL(normalizeUrl(endpoint));
  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = "/oidc";
  }

  return parsed.toString().replace(/\/$/, "");
}

function getLogtoIssuer(): string {
  const issuer = getOptionalLogtoIssuer();
  if (!issuer) {
    throw new Error("LOGTO_ISSUER or LOGTO_ENDPOINT is not configured");
  }

  return issuer;
}

export function getLogtoCallbackUrl(): string {
  return normalizeUrl(readOptionalEnv("LOGTO_CALLBACK_URL") ?? `${STORE_RUNTIME.adminUrl}/callback`);
}

function getLogtoPostLogoutRedirectUrl(postLogoutRedirectUrl?: string | null): string {
  return normalizeUrl(
    postLogoutRedirectUrl ??
      readOptionalEnv("LOGTO_POST_LOGOUT_REDIRECT_URL") ??
      `${STORE_RUNTIME.adminUrl}/admin/login`,
  );
}

function getSessionCookieOptions(maxAge: number) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: STORE_RUNTIME.adminUrl.startsWith("https://"),
    maxAge,
  };
}

function signValue(encodedPayload: string): string {
  return createHmac("sha256", getCookieSigningSecret()).update(encodedPayload).digest("base64url");
}

function encodeSignedPayload(payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signValue(encodedPayload)}`;
}

function decodeSignedPayload<T>(value: string): T | null {
  const separatorIndex = value.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const encodedPayload = value.slice(0, separatorIndex);
  const providedSignature = value.slice(separatorIndex + 1);
  const expectedSignature = signValue(encodedPayload);

  try {
    const provided = Buffer.from(providedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return null;
    }

    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function readSignedCookie<T>(cookies: CookieValue[], cookieName: string): T | null {
  const rawValue = cookies.find((cookie) => cookie.name === cookieName)?.value;
  if (!rawValue) {
    return null;
  }

  return decodeSignedPayload<T>(rawValue);
}

function setCookie(response: NextResponse, cookieName: string, value: string, maxAge: number) {
  response.cookies.set(cookieName, value, getSessionCookieOptions(maxAge));
}

function clearCookie(response: NextResponse, cookieName: string) {
  response.cookies.set(cookieName, "", { ...getSessionCookieOptions(0), maxAge: 0 });
}

function isAdminRole(role: string | null): role is UserRole {
  return !!role && ADMIN_ROLES.has(role as UserRole);
}

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildLogtoSessionUser(session: LogtoAdminSessionPayload): User {
  const now = new Date().toISOString();

  return {
    id: session.userId,
    email: session.email,
    role: "authenticated",
    aud: "authenticated",
    created_at: now,
    updated_at: now,
    app_metadata: {
      admin_auth_provider: "logto",
      provider_subject: session.subject,
      username: session.username,
      role: session.role,
    },
    user_metadata: {
      full_name: session.fullName,
      name: session.fullName,
      auth_source: "logto",
    },
    identities: [],
  } as User;
}

export function isLogtoSessionUser(user: User | null | undefined): boolean {
  if (!user) {
    return false;
  }

  const appMetadata = typeof user.app_metadata === "object" && user.app_metadata ? user.app_metadata : {};
  return Reflect.get(appMetadata, "admin_auth_provider") === "logto";
}

export function readLogtoAdminSessionCookie(cookies: CookieValue[]): LogtoAdminSessionPayload | null {
  const payload = readSignedCookie<LogtoAdminSessionPayload>(cookies, LOGTO_ADMIN_SESSION_COOKIE_NAME);

  if (!payload || payload.version !== 1 || !payload.userId || !payload.subject || !payload.email) {
    return null;
  }

  if (!isAdminRole(payload.role)) {
    return null;
  }

  return payload;
}

export function readLogtoAdminSessionUser(cookies: CookieValue[]): User | null {
  const session = readLogtoAdminSessionCookie(cookies);
  return session ? buildLogtoSessionUser(session) : null;
}

export function writeLogtoAdminSessionCookie(response: NextResponse, payload: Omit<LogtoAdminSessionPayload, "version">) {
  setCookie(
    response,
    LOGTO_ADMIN_SESSION_COOKIE_NAME,
    encodeSignedPayload({ version: 1, ...payload }),
    LOGTO_ADMIN_SESSION_MAX_AGE,
  );
}

export function clearLogtoAdminSessionCookies(response: NextResponse) {
  clearCookie(response, LOGTO_ADMIN_SESSION_COOKIE_NAME);
  clearCookie(response, LOGTO_ADMIN_STATE_COOKIE_NAME);
}

function createLogtoAdminStatePayload(nextPath: string): LogtoAdminStatePayload {
  return {
    version: 1,
    state: randomBytes(24).toString("base64url"),
    nextPath: sanitizeInternalRedirectPath(nextPath, "/admin"),
    issuedAt: new Date().toISOString(),
  };
}

export function writeLogtoAdminStateCookie(response: NextResponse, payload: LogtoAdminStatePayload) {
  setCookie(
    response,
    LOGTO_ADMIN_STATE_COOKIE_NAME,
    encodeSignedPayload(payload),
    LOGTO_ADMIN_STATE_MAX_AGE,
  );

  return payload;
}

export function readLogtoAdminStateCookie(cookies: CookieValue[]): LogtoAdminStatePayload | null {
  const payload = readSignedCookie<LogtoAdminStatePayload>(cookies, LOGTO_ADMIN_STATE_COOKIE_NAME);

  if (!payload || payload.version !== 1 || !payload.state) {
    return null;
  }

  return {
    ...payload,
    nextPath: sanitizeInternalRedirectPath(payload.nextPath, "/admin"),
  };
}

export async function getLogtoDiscoveryDocument(): Promise<LogtoDiscoveryDocument> {
  const response = await fetch(`${getLogtoIssuer()}/.well-known/openid-configuration`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Logto discovery failed with status ${response.status}`);
  }

  return (await response.json()) as LogtoDiscoveryDocument;
}

export async function buildLogtoAuthorizeUrl(nextPath: string) {
  const discovery = await getLogtoDiscoveryDocument();
  const statePayload = createLogtoAdminStatePayload(nextPath);
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", getLogtoAppId());
  url.searchParams.set("redirect_uri", getLogtoCallbackUrl());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", statePayload.state);

  return {
    url,
    statePayload,
  };
}

export async function exchangeLogtoCodeForTokens(code: string): Promise<LogtoTokenResponse> {
  const discovery = await getLogtoDiscoveryDocument();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getLogtoCallbackUrl(),
  });
  const authorization = Buffer.from(`${getLogtoAppId()}:${getLogtoAppSecret()}`, "utf8").toString("base64");

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Logto token exchange failed (${response.status}): ${errorBody}`);
  }

  return (await response.json()) as LogtoTokenResponse;
}

export async function fetchLogtoUserInfo(accessToken: string): Promise<LogtoUserInfo> {
  const discovery = await getLogtoDiscoveryDocument();
  const response = await fetch(discovery.userinfo_endpoint, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Logto userinfo failed with status ${response.status}`);
  }

  return (await response.json()) as LogtoUserInfo;
}

export async function getLogtoLogoutRedirectUrl(
  idTokenHint: string | null,
  options?: {
    postLogoutRedirectUrl?: string | null;
  },
) {
  const discovery = await getLogtoDiscoveryDocument();

  if (!discovery.end_session_endpoint) {
    return getLogtoPostLogoutRedirectUrl(options?.postLogoutRedirectUrl ?? null);
  }

  const url = new URL(discovery.end_session_endpoint);
  url.searchParams.set(
    "post_logout_redirect_uri",
    getLogtoPostLogoutRedirectUrl(options?.postLogoutRedirectUrl ?? null),
  );
  url.searchParams.set("client_id", getLogtoAppId());

  if (idTokenHint) {
    url.searchParams.set("id_token_hint", idTokenHint);
  }

  return url.toString();
}

export async function findLegacyAdminBridgeByLogtoSubject(
  providerSubject: string,
): Promise<LogtoAdminBridgeRecord | null> {
  const row = await queryAdminLightPostgresOne<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
    task_definition: string | null;
    provider_subject: string;
  }>(
    `
      select
        u.id as user_id,
        nullif(u.primary_email, '') as email,
        u.display_name as full_name,
        sur.role,
        sur.task_definition,
        apl.provider_subject
      from auth_provider_links apl
      inner join users u
        on u.id = apl.user_id
      inner join store_user_roles sur
        on sur.user_id = u.id
       and sur.store_slug = $1
       and coalesce(sur.is_active, true) = true
      where apl.provider = 'logto'
        and apl.provider_subject = $2
        and coalesce(u.is_active, true) = true
      order by case sur.role
        when 'super_admin' then 0
        when 'product_manager' then 1
        when 'content_creator' then 2
        when 'order_manager' then 3
        else 99
      end
      limit 1
    `,
    [STORE_RUNTIME.slug, providerSubject],
  );

  if (!row || !isAdminRole(row.role)) {
    return null;
  }

  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    taskDefinition: row.task_definition,
    providerSubject: row.provider_subject,
  };
}

export async function findLegacyAdminBridgeByUserId(
  userId: string,
  providerSubject?: string | null,
): Promise<LogtoAdminBridgeRecord | null> {
  const row = await queryAdminLightPostgresOne<{
    user_id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
    task_definition: string | null;
    provider_subject: string;
  }>(
    `
      select
        u.id as user_id,
        nullif(u.primary_email, '') as email,
        u.display_name as full_name,
        sur.role,
        sur.task_definition,
        apl.provider_subject
      from users u
      inner join auth_provider_links apl
        on apl.user_id = u.id
       and apl.provider = 'logto'
      inner join store_user_roles sur
        on sur.user_id = u.id
       and sur.store_slug = $2
       and coalesce(sur.is_active, true) = true
      where u.id = $1
        and coalesce(u.is_active, true) = true
        and ($3::text is null or apl.provider_subject = $3)
      order by case sur.role
        when 'super_admin' then 0
        when 'product_manager' then 1
        when 'content_creator' then 2
        when 'order_manager' then 3
        else 99
      end
      limit 1
    `,
    [userId, STORE_RUNTIME.slug, providerSubject ?? null],
  );

  if (!row || !isAdminRole(row.role)) {
    return null;
  }

  return {
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    taskDefinition: row.task_definition,
    providerSubject: row.provider_subject,
  };
}

export function resolveLogtoAdminSessionIdentity(cookies: CookieValue[]) {
  const session = readLogtoAdminSessionCookie(cookies);
  if (!session) {
    return null;
  }

  return {
    session,
    user: buildLogtoSessionUser(session),
  };
}

export function buildLogtoAdminSessionPayload(input: {
  bridge: LogtoAdminBridgeRecord;
  userInfo: LogtoUserInfo;
  idToken: string | null;
}): Omit<LogtoAdminSessionPayload, "version"> {
  const normalizedEmail =
    input.bridge.email ??
    coerceString(input.userInfo.email) ??
    `${input.userInfo.sub}@celebix.local`;

  return {
    userId: input.bridge.userId,
    subject: input.userInfo.sub,
    email: normalizedEmail,
    fullName:
      input.bridge.fullName ??
      coerceString(input.userInfo.name) ??
      null,
    username:
      coerceString(input.userInfo.username) ??
      coerceString(input.userInfo.preferred_username) ??
      null,
    role: input.bridge.role,
    idToken: input.idToken,
    issuedAt: new Date().toISOString(),
  };
}

export {
  LOGTO_ADMIN_SESSION_COOKIE_NAME,
  LOGTO_ADMIN_STATE_COOKIE_NAME,
};
