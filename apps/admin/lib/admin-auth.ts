import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/permissions";
import { readCachedAdminProfile, writeCachedAdminProfile } from "@/lib/admin-profile-cache";
import { getSessionUserFromCookies } from "@/lib/admin-session-cookie";
import { createServiceSupabaseClient } from "@/lib/supabase-server";

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
}

export async function getAdminAuthContext(): Promise<AdminAuthContext | null> {
  const cookieStore = await cookies();
  const user = await getSessionUserFromCookies(cookieStore.getAll());

  if (!user) {
    return null;
  }

  const cachedProfile = readCachedAdminProfile(user.id);

  if (cachedProfile) {
    return {
      user,
      profile: {
        ...cachedProfile,
        email: user.email || "",
      },
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
    return null;
  }

  writeCachedAdminProfile(profile);

  return {
    user,
    profile: {
      ...profile,
      email: user.email || "",
    },
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
