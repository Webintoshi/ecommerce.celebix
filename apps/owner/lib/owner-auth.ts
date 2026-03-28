import "server-only";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createOwnerServerClient, createOwnerServiceClient } from "@/lib/owner-supabase-server";

export interface OwnerProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: "super_admin" | "affiliate_admin";
  is_active: boolean;
}

export interface OwnerAuthContext {
  user: User;
  profile: OwnerProfile;
}

export async function getOwnerAuthContext(): Promise<OwnerAuthContext | null> {
  const supabase = await createOwnerServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const serviceClient = createOwnerServiceClient();
  const { data: profile, error } = await serviceClient
    .from("owner_profiles")
    .select("id, email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle<OwnerProfile>();

  if (error || !profile || !profile.is_active) {
    return null;
  }

  return { user, profile };
}

export async function requireOwnerAuth(nextPath = "/"): Promise<OwnerAuthContext> {
  const context = await getOwnerAuthContext();

  if (!context) {
    const search = nextPath && nextPath !== "/" ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${search}`);
  }

  return context;
}

export function requireSuperAdmin(context: OwnerAuthContext): OwnerAuthContext {
  if (!isSuperAdmin(context)) {
    redirect("/");
  }

  return context;
}

export function isSuperAdmin(context: OwnerAuthContext | null): context is OwnerAuthContext {
  return Boolean(context && context.profile.role === "super_admin");
}
