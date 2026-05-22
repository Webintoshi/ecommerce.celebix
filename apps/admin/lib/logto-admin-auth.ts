import "server-only";

import type { UserRole } from "@/lib/permissions";
import { STORE_RUNTIME } from "@/lib/store-runtime";

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
