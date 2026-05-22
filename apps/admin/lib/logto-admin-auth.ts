import type { NextRequest } from "next/server";
import EdgeLogtoClient from "@logto/next/edge";
import LogtoServerClient, { getLogtoContext, type LogtoContext } from "@logto/next/server-actions";
import type { UserRole } from "@/lib/permissions";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import { getLogtoAdminConfig, getLogtoAdminConfigStatus } from "@/app/logto";
import type { AdminAuthContext, AdminProfile, AdminSessionUser } from "@/lib/admin-auth";
import { writeCachedAdminProfile } from "@/lib/admin-profile-cache";

export const LOGTO_ADMIN_AUTH_PROVIDER = "logto" as const;
export const LOGTO_ADMIN_PILOT_STORE_SLUG = "derycraftcomtr" as const;
export const LOGTO_ADMIN_SIGN_IN_PATH = "/sign-in" as const;
export const LOGTO_ADMIN_SIGN_OUT_PATH = "/sign-out" as const;
export const LOGTO_ADMIN_CALLBACK_PATH = "/callback" as const;

export const LOGTO_ADMIN_BRIDGE_TABLES = ["users", "auth_provider_links", "store_user_roles"] as const;

export type LogtoAdminBridgeUserRecord = {
  id: string;
  primary_email: string;
  display_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LogtoAdminBridgeProviderLinkRecord = {
  user_id: string;
  provider: "logto" | "supabase";
  provider_subject: string;
  email_snapshot: string | null;
  legacy_supabase_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type LogtoAdminBridgeStoreRoleRecord = {
  user_id: string;
  store_slug: string;
  role: UserRole;
  task_definition: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type LogtoAdminIdentity = {
  subject: string;
  email: string | null;
  name: string | null;
  organization_ids: string[];
};

export type LogtoAdminAuthMode = {
  provider: string;
  enabled: boolean;
  storeGuardSatisfied: boolean;
  pilotStoreSlug: typeof LOGTO_ADMIN_PILOT_STORE_SLUG;
};

export function isLogtoAdminPilotStore(slug = STORE_RUNTIME.slug): boolean {
  return slug === LOGTO_ADMIN_PILOT_STORE_SLUG;
}

export function shouldUseLogtoAdminAuth(provider = process.env.ADMIN_AUTH_PROVIDER): boolean {
  return provider === LOGTO_ADMIN_AUTH_PROVIDER && isLogtoAdminPilotStore();
}

export function getLogtoAdminAuthMode(provider = process.env.ADMIN_AUTH_PROVIDER): LogtoAdminAuthMode {
  return {
    provider: provider?.trim() || "supabase",
    enabled: shouldUseLogtoAdminAuth(provider),
    storeGuardSatisfied: isLogtoAdminPilotStore(),
    pilotStoreSlug: LOGTO_ADMIN_PILOT_STORE_SLUG,
  };
}

export function getLogtoAdminBridgePlan() {
  return {
    tables: LOGTO_ADMIN_BRIDGE_TABLES,
    notes: {
      users: "Canonical user record for shared identities across providers.",
      auth_provider_links: "Maps Logto subject and legacy Supabase user IDs to the canonical user.",
      store_user_roles: "Store-scoped admin role and task_definition authority for DeryCraft 2.",
    },
  } as const;
}

type BridgeUserRow = {
  id: string;
  primary_email: string;
  display_name: string | null;
  is_active: boolean;
  provider_subject: string;
  legacy_supabase_user_id: string | null;
};

type BridgeRoleRow = {
  role: string;
  task_definition: string | null;
  is_active: boolean;
};

const ADMIN_ROLE_PRIORITY: Record<UserRole, number> = {
  super_admin: 0,
  product_manager: 1,
  content_creator: 2,
  order_manager: 3,
};

function isKnownAdminRole(value: string): value is UserRole {
  return value in ADMIN_ROLE_PRIORITY;
}

export function isKnownLogtoAdminRole(value: string): value is UserRole {
  return isKnownAdminRole(value);
}

function isMissingBridgeSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = Reflect.get(error, "code");
  return code === "42P01" || code === "42704";
}

function coerceLogtoIdentity(context: LogtoContext): LogtoAdminIdentity | null {
  if (!context.isAuthenticated || !context.claims?.sub) {
    return null;
  }

  return {
    subject: context.claims.sub,
    email: context.userInfo?.email ?? context.claims.email ?? null,
    name: context.userInfo?.name ?? context.claims.name ?? context.claims.username ?? null,
    organization_ids: context.claims.organizations ?? [],
  };
}

async function queryBridgeOne<TRow>(text: string, params: readonly unknown[] = []): Promise<TRow | null> {
  try {
    const { queryLightPostgresOne } = await import("@/lib/db/light-postgres-client");
    return await queryLightPostgresOne<TRow & Record<string, unknown>>(text, params);
  } catch (error) {
    if (isMissingBridgeSchemaError(error)) {
      return null;
    }

    throw error;
  }
}

function buildLogtoAdminSessionUser(
  identity: LogtoAdminIdentity,
  bridgeUser: Pick<BridgeUserRow, "id" | "primary_email" | "display_name">,
): AdminSessionUser {
  return {
    id: bridgeUser.id,
    email: bridgeUser.primary_email || identity.email || "",
    user_metadata: {
      full_name: bridgeUser.display_name || identity.name || null,
      name: bridgeUser.display_name || identity.name || null,
      logto_subject: identity.subject,
      auth_provider: LOGTO_ADMIN_AUTH_PROVIDER,
    },
    app_metadata: {
      provider: LOGTO_ADMIN_AUTH_PROVIDER,
      provider_subject: identity.subject,
      organizations: identity.organization_ids,
    },
  };
}

function buildLogtoAdminProfile(
  bridgeUser: Pick<BridgeUserRow, "id" | "primary_email" | "display_name">,
  roleRow: Pick<BridgeRoleRow, "role" | "task_definition">,
  identity: LogtoAdminIdentity,
): AdminProfile | null {
  if (!isKnownAdminRole(roleRow.role)) {
    return null;
  }

  return {
    id: bridgeUser.id,
    email: bridgeUser.primary_email || identity.email || "",
    full_name: bridgeUser.display_name || identity.name || null,
    role: roleRow.role,
    task_definition: roleRow.task_definition,
  };
}

export async function getLogtoSessionUser(): Promise<LogtoAdminIdentity | null> {
  if (!shouldUseLogtoAdminAuth()) {
    return null;
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    return null;
  }

  const context = await getLogtoContext(config, { fetchUserInfo: true });
  return coerceLogtoIdentity(context);
}

export async function getLogtoSessionUserFromRequest(request: NextRequest): Promise<LogtoAdminIdentity | null> {
  if (!shouldUseLogtoAdminAuth()) {
    return null;
  }

  const config = getLogtoAdminConfig();
  if (!config) {
    return null;
  }

  const client = new EdgeLogtoClient(config);
  const context = await client.getLogtoContext(request, { fetchUserInfo: true });
  return coerceLogtoIdentity(context);
}

export function getLogtoSubject(identity: LogtoAdminIdentity | null): string | null {
  return identity?.subject ?? null;
}

export async function resolveLogtoAdminUser(
  subjectOrIdentity: string | LogtoAdminIdentity | null,
): Promise<BridgeUserRow | null> {
  const subject =
    typeof subjectOrIdentity === "string"
      ? subjectOrIdentity
      : getLogtoSubject(subjectOrIdentity);

  if (!subject) {
    return null;
  }

  return queryBridgeOne<BridgeUserRow>(
    `
      select
        u.id,
        u.primary_email,
        u.display_name,
        u.is_active,
        apl.provider_subject,
        apl.legacy_supabase_user_id
      from public.auth_provider_links apl
      join public.users u on u.id = apl.user_id
      where apl.provider = 'logto'
        and apl.provider_subject = $1
      limit 1
    `,
    [subject],
  );
}

export async function resolveLogtoStoreRole(
  userId: string,
  storeSlug: string = STORE_RUNTIME.slug,
): Promise<BridgeRoleRow | null> {
  if (!isLogtoAdminPilotStore(storeSlug)) {
    return null;
  }

  return queryBridgeOne<BridgeRoleRow>(
    `
      select
        role,
        task_definition,
        is_active
      from public.store_user_roles
      where user_id = $1
        and store_slug = $2
        and is_active = true
      order by
        case role
          when 'super_admin' then 0
          when 'product_manager' then 1
          when 'content_creator' then 2
          when 'order_manager' then 3
          else 99
        end asc,
        updated_at desc
      limit 1
    `,
    [userId, storeSlug],
  );
}

export async function getLogtoAdminAuthContext(): Promise<AdminAuthContext | null> {
  if (!shouldUseLogtoAdminAuth()) {
    return null;
  }

  const identity = await getLogtoSessionUser();
  if (!identity) {
    return null;
  }

  const bridgeUser = await resolveLogtoAdminUser(identity);
  if (!bridgeUser || !bridgeUser.is_active) {
    return null;
  }

  const roleRow = await resolveLogtoStoreRole(bridgeUser.id, STORE_RUNTIME.slug);
  if (!roleRow || !roleRow.is_active) {
    return null;
  }

  const profile = buildLogtoAdminProfile(bridgeUser, roleRow, identity);
  if (!profile) {
    return null;
  }

  writeCachedAdminProfile({
    id: profile.id,
    full_name: profile.full_name,
    role: profile.role,
    task_definition: profile.task_definition,
  });

  return {
    user: buildLogtoAdminSessionUser(identity, bridgeUser),
    profile,
  };
}

export async function handleLogtoAdminCallback(request: NextRequest): Promise<{
  identity: LogtoAdminIdentity | null;
  postRedirectUri: string | undefined;
}> {
  const config = getLogtoAdminConfig();
  if (!config) {
    return { identity: null, postRedirectUri: undefined };
  }

  const client = new LogtoServerClient(config);
  const postRedirectUri = await client.handleSignInCallback(request.nextUrl.toString());
  const context = await client.getLogtoContext({ fetchUserInfo: true });

  return {
    identity: coerceLogtoIdentity(context),
    postRedirectUri,
  };
}

export function getLogtoAdminRuntimeReadiness() {
  const configStatus = getLogtoAdminConfigStatus();
  return {
    gate: getLogtoAdminAuthMode(),
    config: configStatus,
    bridgeTables: LOGTO_ADMIN_BRIDGE_TABLES,
  } as const;
}
