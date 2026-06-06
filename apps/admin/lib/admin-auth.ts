import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { AdminAuthProvider } from "@/lib/admin-auth-provider";
import type { UserRole } from "@/lib/permissions";
import { readCachedAdminProfile, writeCachedAdminProfile } from "@/lib/admin-profile-cache";
import { readAdminRoleCookie } from "@/lib/admin-role-cookie";
import { getSessionUserFromCookies, readSessionUserSnapshotFromCookies } from "@/lib/admin-session-cookie";
import {
  findLegacyAdminBridgeByUserId,
  isLogtoSessionUser,
} from "@/lib/logto-admin-auth";
import { createServiceSupabaseClient } from "@/lib/supabase-server";
import { isLightPostgresAuthBlockedRuntime } from "@/lib/supabase-shared";

export interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  task_definition: string | null;
}

export interface AdminAuthContext {
  user: User;
  profile: AdminProfile;
  provider: AdminAuthProvider;
  authSource: AdminAuthProvider;
}

type CookieValue = {
  name: string;
  value: string;
};

function readUserDisplayName(user: User): string | null {
  const metadata = typeof user.user_metadata === "object" && user.user_metadata ? user.user_metadata : {};
  const fullName = Reflect.get(metadata, "full_name");
  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const fallbackName = Reflect.get(metadata, "name");
  if (typeof fallbackName === "string" && fallbackName.trim()) {
    return fallbackName.trim();
  }

  return null;
}

function resolveSessionProvider(user: User): AdminAuthProvider {
  return isLogtoSessionUser(user) ? "logto" : "supabase";
}

function buildFallbackAdminAuthContext(cookieValues: CookieValue[], userOverride?: User | null): AdminAuthContext | null {
  const user = userOverride ?? readSessionUserSnapshotFromCookies(cookieValues);
  if (!user) {
    return null;
  }

  const adminRole = readAdminRoleCookie(cookieValues);
  if (!adminRole || adminRole.userId !== user.id) {
    return null;
  }

  return {
    user,
    profile: {
      id: user.id,
      email: user.email || "",
      full_name: readUserDisplayName(user),
      role: adminRole.role,
      task_definition: null,
    },
    provider: resolveSessionProvider(user),
    authSource: resolveSessionProvider(user),
  };
}

export async function getAdminBootstrapProfileFromCookies(): Promise<Pick<AdminProfile, "email" | "full_name" | "role"> | null> {
  if (isLightPostgresAuthBlockedRuntime()) {
    return null;
  }

  const cookieStore = await cookies();
  const fallbackContext = buildFallbackAdminAuthContext(cookieStore.getAll());

  if (!fallbackContext) {
    return null;
  }

  return {
    email: fallbackContext.profile.email,
    full_name: fallbackContext.profile.full_name,
    role: fallbackContext.profile.role,
  };
}

export async function getAdminAuthContext(): Promise<AdminAuthContext | null> {
  if (isLightPostgresAuthBlockedRuntime()) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieValues = cookieStore.getAll();
  const snapshotUser = readSessionUserSnapshotFromCookies(cookieValues);
  const user = snapshotUser ?? (await getSessionUserFromCookies(cookieValues));

  if (!user) {
    return null;
  }

  const fallbackContext = buildFallbackAdminAuthContext(cookieValues, user);

  const cachedProfile = readCachedAdminProfile(user.id);

  if (cachedProfile) {
    return {
      user,
      profile: {
        ...cachedProfile,
        email: user.email || "",
      },
      provider: resolveSessionProvider(user),
      authSource: resolveSessionProvider(user),
    };
  }

  if (isLogtoSessionUser(user)) {
    const appMetadata = typeof user.app_metadata === "object" && user.app_metadata ? user.app_metadata : {};
    const providerSubject = Reflect.get(appMetadata, "provider_subject");
    const bridge = await findLegacyAdminBridgeByUserId(
      user.id,
      typeof providerSubject === "string" ? providerSubject : null,
    );

    if (!bridge) {
      return fallbackContext;
    }

    const profile = {
      id: bridge.userId,
      full_name: bridge.fullName,
      role: bridge.role,
      task_definition: bridge.taskDefinition,
    };

    writeCachedAdminProfile(profile);

    return {
      user,
      profile: {
        ...profile,
        email: bridge.email || user.email || "",
      },
      provider: "logto",
      authSource: "logto",
    };
  }

  const serviceClient = createServiceSupabaseClient();
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, role, task_definition")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      full_name: string | null;
      role: UserRole;
      task_definition: string | null;
    }>();

  if (profileError || !profile) {
    if (fallbackContext) {
      console.warn("Admin auth profile fallback activated.", {
        userId: user.id,
        error: profileError?.message ?? "profile_missing",
      });
      return fallbackContext;
    }

    return null;
  }

  writeCachedAdminProfile(profile);

  return {
    user,
    profile: {
      ...profile,
      email: user.email || "",
    },
    provider: resolveSessionProvider(user),
    authSource: resolveSessionProvider(user),
  };
}

export async function requireAdminAuth(nextPath = "/admin"): Promise<AdminAuthContext> {
  const context = await getAdminAuthContext();

  if (!context) {
    const search = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/admin/login${search}`);
  }

  return context;
}

export async function requireSuperAdmin(nextPath = "/admin"): Promise<AdminAuthContext> {
  const context = await requireAdminAuth(nextPath);

  if (context.profile.role !== "super_admin") {
    redirect("/admin");
  }

  return context;
}
