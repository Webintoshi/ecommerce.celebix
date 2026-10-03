import "server-only";

import { redirect } from "next/navigation";
import {getPlatformOperator} from './platform/auth.ts';
import type { User } from "@supabase/supabase-js";
import { createOwnerServerClient } from "@/lib/owner-supabase-server";
import {
  formatMissingOwnerSupabaseEnvMessage,
  getMissingOwnerSupabaseEnvNames,
} from "@/lib/owner-supabase-shared";

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
  const operator = await getPlatformOperator();
  if (!operator) return null;
  const missingEnv = getMissingOwnerSupabaseEnvNames();

  if (missingEnv.length > 0) {
    console.error("Owner auth skipped:", formatMissingOwnerSupabaseEnvMessage(missingEnv));
    return null;
  }

  const supabase = await createOwnerServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  if (user.id !== operator.subject) return null;
  return { user, profile: {id:user.id,email:operator.email,full_name:operator.label,role:'super_admin',is_active:true} };
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
