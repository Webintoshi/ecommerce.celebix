import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import {
  getLightPostgresCustomerById,
  getLightPostgresCustomerByEmail,
  getOrCreateLightPostgresCustomer,
} from "@/lib/db/light-postgres-commerce-adapter";
import { queryLightPostgresOne, withLightPostgresTransaction } from "@/lib/db/light-postgres-client";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

const LOGTO_CUSTOMER_SESSION_COOKIE_NAME = "celebix-customer-logto-session";
const LOGTO_CUSTOMER_STATE_COOKIE_NAME = "celebix-customer-logto-state";
const LOGTO_CUSTOMER_SESSION_MAX_AGE = 14 * 24 * 60 * 60;
const LOGTO_CUSTOMER_STATE_MAX_AGE = 10 * 60;

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

type SignedCookiePayload = {
  version: 1;
};

type LogtoFirstScreen =
  | "sign_in"
  | "register"
  | "reset_password"
  | "identifier:sign-in"
  | "identifier:register";

type LogtoIdentifier = "email" | "username" | "phone";

type BuildAuthorizeOptions = {
  nextPath: string;
  firstScreen?: LogtoFirstScreen | null;
  identifier?: LogtoIdentifier[] | null;
  loginHint?: string | null;
  directSignIn?: string | null;
};

type LogtoCustomerBridgeRecord = {
  principalId: string;
  customerId: string;
  subject: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  displayName: string | null;
  customerCreatedAt: string | null;
};

type LogtoCustomerSessionPayload = SignedCookiePayload & {
  principalId: string;
  customerId: string;
  subject: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  displayName: string | null;
  username: string | null;
  customerCreatedAt: string | null;
  idToken: string | null;
  issuedAt: string;
};

type LogtoCustomerStatePayload = SignedCookiePayload & {
  state: string;
  nextPath: string;
  firstScreen: LogtoFirstScreen | null;
  loginHint: string | null;
  directSignIn: string | null;
  identifier: LogtoIdentifier[] | null;
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
    "LOGTO_CUSTOMER_APP_ID",
    readOptionalEnv("LOGTO_CUSTOMER_APP_ID", "LOGTO_APP_ID") ?? undefined,
  );
}

function getLogtoAppSecret() {
  return readRequiredEnv(
    "LOGTO_CUSTOMER_APP_SECRET",
    readOptionalEnv("LOGTO_CUSTOMER_APP_SECRET", "LOGTO_APP_SECRET") ?? undefined,
  );
}

function getOptionalLogtoIssuer(): string | null {
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

function getLogtoCallbackUrl(): string {
  return normalizeUrl(
    readOptionalEnv("LOGTO_CUSTOMER_CALLBACK_URL", "LOGTO_CALLBACK_URL") ??
      `${STOREFRONT_RUNTIME.siteUrl}/callback`,
  );
}

function getLogtoPostLogoutRedirectUrl(postLogoutRedirectUrl?: string | null): string {
  return normalizeUrl(
    postLogoutRedirectUrl ??
      readOptionalEnv("LOGTO_CUSTOMER_POST_LOGOUT_REDIRECT_URL", "LOGTO_POST_LOGOUT_REDIRECT_URL") ??
      STOREFRONT_RUNTIME.siteUrl,
  );
}

function getSessionCookieOptions(maxAge: number) {
  return {
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: STOREFRONT_RUNTIME.siteUrl.startsWith("https://"),
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

function coerceString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEmail(email: string | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value || null;
}

function splitDisplayName(displayName: string | null) {
  const normalized = displayName?.trim();
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: null };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function buildLogtoSessionUser(session: LogtoCustomerSessionPayload): User {
  const createdAt = session.customerCreatedAt ?? session.issuedAt;

  return {
    id: session.principalId,
    email: session.email,
    role: "authenticated",
    aud: "authenticated",
    created_at: createdAt,
    updated_at: createdAt,
    app_metadata: {
      customer_auth_provider: "logto",
      provider_subject: session.subject,
      principal_id: session.principalId,
      customer_id: session.customerId,
      username: session.username,
    },
    user_metadata: {
      full_name: session.displayName,
      name: session.displayName,
      first_name: session.firstName,
      last_name: session.lastName,
      phone: session.phone,
      auth_source: "logto",
    },
    identities: [],
  } as User;
}

export function readLogtoCustomerSessionCookie(
  cookies: CookieValue[],
): LogtoCustomerSessionPayload | null {
  const payload = readSignedCookie<LogtoCustomerSessionPayload>(
    cookies,
    LOGTO_CUSTOMER_SESSION_COOKIE_NAME,
  );

  if (!payload || payload.version !== 1 || !payload.customerId || !payload.subject || !payload.email) {
    return null;
  }

  return payload;
}

export function readLogtoCustomerSessionUser(cookies: CookieValue[]): User | null {
  const session = readLogtoCustomerSessionCookie(cookies);
  return session ? buildLogtoSessionUser(session) : null;
}

export function writeLogtoCustomerSessionCookie(
  response: NextResponse,
  payload: Omit<LogtoCustomerSessionPayload, "version">,
) {
  setCookie(
    response,
    LOGTO_CUSTOMER_SESSION_COOKIE_NAME,
    encodeSignedPayload({ version: 1, ...payload }),
    LOGTO_CUSTOMER_SESSION_MAX_AGE,
  );
}

export function clearLogtoCustomerSessionCookies(response: NextResponse) {
  clearCookie(response, LOGTO_CUSTOMER_SESSION_COOKIE_NAME);
  clearCookie(response, LOGTO_CUSTOMER_STATE_COOKIE_NAME);
}

function createLogtoCustomerStatePayload(
  options: BuildAuthorizeOptions,
): LogtoCustomerStatePayload {
  return {
    version: 1,
    state: randomBytes(24).toString("base64url"),
    nextPath: sanitizeInternalRedirectPath(options.nextPath, "/hesap"),
    firstScreen: options.firstScreen ?? null,
    loginHint: options.loginHint ?? null,
    directSignIn: options.directSignIn ?? null,
    identifier: options.identifier ?? null,
    issuedAt: new Date().toISOString(),
  };
}

export function writeLogtoCustomerStateCookie(
  response: NextResponse,
  payload: LogtoCustomerStatePayload,
) {
  setCookie(
    response,
    LOGTO_CUSTOMER_STATE_COOKIE_NAME,
    encodeSignedPayload(payload),
    LOGTO_CUSTOMER_STATE_MAX_AGE,
  );

  return payload;
}

export function readLogtoCustomerStateCookie(
  cookies: CookieValue[],
): LogtoCustomerStatePayload | null {
  const payload = readSignedCookie<LogtoCustomerStatePayload>(
    cookies,
    LOGTO_CUSTOMER_STATE_COOKIE_NAME,
  );

  if (!payload || payload.version !== 1 || !payload.state) {
    return null;
  }

  return {
    ...payload,
    nextPath: sanitizeInternalRedirectPath(payload.nextPath, "/hesap"),
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

export async function buildLogtoAuthorizeUrl(options: BuildAuthorizeOptions) {
  const discovery = await getLogtoDiscoveryDocument();
  const statePayload = createLogtoCustomerStatePayload(options);
  const url = new URL(discovery.authorization_endpoint);

  url.searchParams.set("client_id", getLogtoAppId());
  url.searchParams.set("redirect_uri", getLogtoCallbackUrl());
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

export async function exchangeLogtoCodeForTokens(code: string): Promise<LogtoTokenResponse> {
  const discovery = await getLogtoDiscoveryDocument();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getLogtoCallbackUrl(),
  });
  const authorization = Buffer.from(`${getLogtoAppId()}:${getLogtoAppSecret()}`, "utf8").toString(
    "base64",
  );

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

async function ensureStoreBridgeRow(client: {
  query: <TRow extends Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: TRow[] }>;
}) {
  await client.query(
    `
      insert into auth_stores (store_slug, storefront_domain, admin_domain, status)
      values ($1, $2, $3, 'active')
      on conflict (store_slug) do update
      set
        storefront_domain = excluded.storefront_domain,
        admin_domain = excluded.admin_domain,
        status = 'active',
        updated_at = now()
    `,
    [
      STOREFRONT_RUNTIME.slug,
      new URL(STOREFRONT_RUNTIME.siteUrl).hostname,
      new URL(STOREFRONT_RUNTIME.adminUrl).hostname,
    ],
  );
}

export async function findCustomerBridgeByLogtoSubject(
  subject: string,
): Promise<LogtoCustomerBridgeRecord | null> {
  const row = await queryLightPostgresOne<{
    principal_id: string;
    customer_id: string;
    subject: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    display_name: string | null;
    customer_created_at: string | null;
  }>(
    `
      select
        p.id as principal_id,
        c.id as customer_id,
        p.logto_user_id as subject,
        c.email,
        c.first_name,
        c.last_name,
        c.phone,
        p.display_name,
        c.created_at as customer_created_at
      from auth_principals p
      inner join auth_store_customer_links scl
        on scl.principal_id = p.id
       and scl.store_slug = $1
      inner join public.customers c
        on c.id = scl.legacy_customer_id
      where p.logto_user_id = $2
        and p.principal_status = 'active'
        and coalesce(c.is_active, true) = true
      limit 1
    `,
    [STOREFRONT_RUNTIME.slug, subject],
  );

  if (!row) {
    return null;
  }

  return {
    principalId: row.principal_id,
    customerId: row.customer_id,
    subject: row.subject,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    displayName: row.display_name,
    customerCreatedAt: row.customer_created_at,
  };
}

export async function getLogtoCustomerAccountSnapshot(subject: string) {
  const bridge = await findCustomerBridgeByLogtoSubject(subject);
  if (!bridge) {
    return null;
  }

  const customer = await getLightPostgresCustomerById(bridge.customerId);
  if (!customer) {
    return null;
  }

  return {
    bridge,
    customer,
  };
}

export async function findOrProvisionCustomerBridge(
  userInfo: LogtoUserInfo,
): Promise<LogtoCustomerBridgeRecord> {
  const normalizedEmail = normalizeEmail(userInfo.email);
  if (!normalizedEmail) {
    throw new Error("Logto customer user missing email");
  }

  const displayName =
    coerceString(userInfo.name) ??
    coerceString(userInfo.preferred_username) ??
    coerceString(userInfo.username);
  const nameParts = splitDisplayName(displayName);

  return withLightPostgresTransaction(async (client) => {
    await ensureStoreBridgeRow(client);

    const principalResult = await client.query<{
      id: string;
      logto_user_id: string;
      email_normalized: string | null;
      display_name: string | null;
    }>(
      `
        insert into auth_principals (
          logto_user_id,
          email_normalized,
          display_name,
          principal_status
        )
        values ($1, $2, $3, 'active')
        on conflict (logto_user_id) do update
        set
          email_normalized = excluded.email_normalized,
          display_name = coalesce(excluded.display_name, auth_principals.display_name),
          principal_status = 'active',
          updated_at = now()
        returning id, logto_user_id, email_normalized, display_name
      `,
      [userInfo.sub, normalizedEmail, displayName],
    );

    const principal = principalResult.rows[0];
    if (!principal) {
      throw new Error("Logto principal could not be provisioned");
    }

    await client.query(
      `
        insert into auth_store_memberships (
          principal_id,
          store_slug,
          subject_type,
          membership_status
        )
        values ($1::uuid, $2, 'customer', 'active')
        on conflict (principal_id, store_slug, subject_type) do update
        set
          membership_status = 'active',
          updated_at = now()
      `,
      [principal.id, STOREFRONT_RUNTIME.slug],
    );

    const existingBridge = await client.query<{
      customer_id: string;
      email: string;
      first_name: string | null;
      last_name: string | null;
      phone: string | null;
      customer_created_at: string | null;
    }>(
      `
        select
          c.id as customer_id,
          c.email,
          c.first_name,
          c.last_name,
          c.phone,
          c.created_at as customer_created_at
        from auth_store_customer_links scl
        inner join public.customers c
          on c.id = scl.legacy_customer_id
        where scl.principal_id = $1::uuid
          and scl.store_slug = $2
        limit 1
      `,
      [principal.id, STOREFRONT_RUNTIME.slug],
    );

    const existingCustomer = existingBridge.rows[0]
      ? {
          id: existingBridge.rows[0].customer_id,
          email: existingBridge.rows[0].email,
          first_name: existingBridge.rows[0].first_name,
          last_name: existingBridge.rows[0].last_name,
          phone: existingBridge.rows[0].phone,
          created_at: existingBridge.rows[0].customer_created_at,
        }
      : null;

    let customer =
      existingCustomer ??
      (await getLightPostgresCustomerByEmail(normalizedEmail, client)) ??
      null;

    if (!customer) {
      customer = await getOrCreateLightPostgresCustomer(
        {
          email: normalizedEmail,
          firstName: nameParts.firstName ?? undefined,
          lastName: nameParts.lastName ?? undefined,
          status: "active",
          isActive: true,
        },
        client,
      );
    }

    if (!customer) {
      throw new Error("Customer bridge could not be provisioned");
    }

    await client.query(
      `
        insert into auth_store_customer_links (
          principal_id,
          store_slug,
          legacy_customer_id,
          source_system,
          sync_status,
          last_synced_at
        )
        values ($1::uuid, $2, $3::uuid, 'light_postgres', 'synced', now())
        on conflict (principal_id, store_slug) do update
        set
          legacy_customer_id = excluded.legacy_customer_id,
          source_system = excluded.source_system,
          sync_status = 'synced',
          last_synced_at = now(),
          updated_at = now()
      `,
      [principal.id, STOREFRONT_RUNTIME.slug, customer.id],
    );

    await client.query(
      `
        insert into auth_audit_bridge_events (
          principal_id,
          store_slug,
          event_type,
          event_payload
        )
        values (
          $1::uuid,
          $2,
          'customer_auth_login',
          jsonb_build_object('provider', 'logto', 'customer_id', $3::uuid)
        )
      `,
      [principal.id, STOREFRONT_RUNTIME.slug, customer.id],
    );

    return {
      principalId: principal.id,
      customerId: customer.id,
      subject: userInfo.sub,
      email: customer.email,
      firstName: customer.first_name ?? nameParts.firstName,
      lastName: customer.last_name ?? nameParts.lastName,
      phone: customer.phone ?? null,
      displayName:
        [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || displayName,
      customerCreatedAt: customer.created_at ?? null,
    };
  });
}

export function resolveLogtoCustomerSessionIdentity(cookies: CookieValue[]) {
  const session = readLogtoCustomerSessionCookie(cookies);
  if (!session) {
    return null;
  }

  return {
    session,
    user: buildLogtoSessionUser(session),
  };
}

export function buildLogtoCustomerSessionPayload(input: {
  bridge: LogtoCustomerBridgeRecord;
  userInfo: LogtoUserInfo;
  idToken: string | null;
}): Omit<LogtoCustomerSessionPayload, "version"> {
  const username =
    coerceString(input.userInfo.preferred_username) ??
    coerceString(input.userInfo.username) ??
    null;

  return {
    principalId: input.bridge.principalId,
    customerId: input.bridge.customerId,
    subject: input.userInfo.sub,
    email: input.bridge.email,
    firstName: input.bridge.firstName,
    lastName: input.bridge.lastName,
    phone: input.bridge.phone,
    displayName: input.bridge.displayName,
    username,
    customerCreatedAt: input.bridge.customerCreatedAt,
    idToken: input.idToken,
    issuedAt: new Date().toISOString(),
  };
}
