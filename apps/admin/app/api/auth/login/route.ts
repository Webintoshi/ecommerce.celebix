import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeInternalRedirectPath } from "@celebix/platform-config/src/http-security";
import {
  isLightPostgresRuntime,
  resolveRuntimeAuthSetupStatus,
} from "@celebix/platform-config/src/light-postgres-runtime";
import {
  getOptionalSupabaseAnonKey,
  getOptionalSupabaseUrl,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase-shared";
import { isLogtoAdminAuthEnabled } from "@/lib/admin-auth-provider";
import { verifyLegacyAdminPassword } from "@/lib/legacy-admin-auth";
import { writeAdminRoleCookie } from "@/lib/admin-role-cookie";
import type { UserRole } from "@/lib/permissions";

type LoginBody = {
  email?: string;
  nextPath?: string;
  password?: string;
};

type UserRecord = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

type AdminProfileRecord = {
  id: string;
  role: UserRole | string | null;
};

const ADMIN_ROLES = new Set<UserRole>(["super_admin", "product_manager", "content_creator", "order_manager"]);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function createAdminLoginClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createDirectAdminServiceClient() {
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isAdminRole(value: unknown): value is UserRole {
  return typeof value === "string" && ADMIN_ROLES.has(value as UserRole);
}

async function getAdminRoleForUser(userId: string, userMetadata?: Record<string, unknown> | null) {
  try {
    const serviceClient = createDirectAdminServiceClient();
    const { data, error } = await serviceClient
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle<AdminProfileRecord>();

    if (error) {
      throw new Error(error.message);
    }

    if (isAdminRole(data?.role)) {
      return data.role;
    }
  } catch (error) {
    console.warn("Admin profile role lookup failed during login.", error);
  }

  const metadataRole =
    userMetadata && typeof userMetadata === "object"
      ? Reflect.get(userMetadata, "role")
      : null;

  return isAdminRole(metadataRole) ? metadataRole : null;
}

async function listAdminUsers(): Promise<UserRecord[]> {
  const serviceClient = createDirectAdminServiceClient();
  const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    throw new Error(error.message);
  }

  return (data.users as UserRecord[]) ?? [];
}

async function repairSelfHostedPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const adminUsers = await listAdminUsers();
  const existingUser = adminUsers.find((entry) => normalizeEmail(entry.email || "") === normalizedEmail);

  if (!existingUser) {
    return { repaired: false as const, reason: "admin_user_missing" as const };
  }

  const serviceClient = createDirectAdminServiceClient();
  const { error } = await serviceClient.auth.admin.updateUserById(existingUser.id, {
    password,
    email_confirm: true,
    user_metadata: existingUser.user_metadata ?? {},
  });

  if (error) {
    throw new Error(error.message);
  }

  return { repaired: true as const };
}

function readAuthErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const maybeMessage = Reflect.get(error, "message");
    if (typeof maybeMessage === "string" && maybeMessage.trim()) {
      return maybeMessage;
    }
  }

  return "Giris yapilamadi.";
}

function isCredentialFailure(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("invalid login credentials") || normalized.includes("invalid credentials");
}

export async function POST(request: Request) {
  try {
    const lightPostgresBlocked =
      isLightPostgresRuntime(process.env, {
        mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
      }) &&
      resolveRuntimeAuthSetupStatus(process.env, {
        mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
        authStatus: ["AUTH_SETUP_STATUS", "NEXT_PUBLIC_AUTH_SETUP_STATUS"],
      }) === "blocked_auth_setup";

    if (lightPostgresBlocked) {
      return NextResponse.json(
        {
          code: "blocked_auth_setup",
          error: "Bu store icin admin auth kurulumu henuz tamamlanmadi.",
        },
        { status: 503 },
      );
    }

    if (!getOptionalSupabaseUrl() || !getOptionalSupabaseAnonKey()) {
      return NextResponse.json(
        {
          code: "auth_env_missing",
          error: "Bu store icin Supabase auth authority henuz tamamlanmadi.",
        },
        { status: 503 },
      );
    }

    const { email, password, nextPath }: LoginBody = await request.json();

    if (isLogtoAdminAuthEnabled()) {
      const redirectTarget = sanitizeInternalRedirectPath(nextPath ?? null, "/admin");
      return NextResponse.json(
        {
          requiresRedirect: true,
          redirectTo: `/api/auth/sign-in?next=${encodeURIComponent(redirectTarget)}`,
        },
        { status: 409 },
      );
    }

    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }

    const normalizedEmail = normalizeEmail(email);

    let repaired = false;
    let publicClient = createAdminLoginClient();
    let { data, error } = await publicClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (readAuthErrorMessage(error).includes("Invalid login credentials")) {
      const legacyVerified = await verifyLegacyAdminPassword(email, password);

      if (legacyVerified) {
        const repairResult = await repairSelfHostedPassword(email, password);
        repaired = repairResult.repaired;

        publicClient = createAdminLoginClient();
        ({ data, error } = await publicClient.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        }));
      }
    }

    const errorMessage = readAuthErrorMessage(error);

    if (error || !data.session) {
      return NextResponse.json(
        { error: isCredentialFailure(errorMessage) ? "E-posta veya sifre hatali." : errorMessage },
        { status: 400 },
      );
    }

    const adminRole = await getAdminRoleForUser(data.user.id, data.user.user_metadata);
    if (!adminRole) {
      return NextResponse.json(
        { error: "Bu mağaza paneline erişim yetkiniz yok." },
        { status: 403 },
      );
    }

    const response = NextResponse.json(
      {
        session: data.session,
        user: data.user,
        repaired,
      },
      { status: 200 },
    );

    writeAdminRoleCookie(response, {
      userId: data.user.id,
      role: adminRole,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giris yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
