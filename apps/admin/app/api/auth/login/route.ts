import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isLightPostgresRuntime,
  resolveRuntimeAuthSetupStatus,
} from "@celebix/platform-config/src/light-postgres-runtime";
import { createServerClient as createAdminServiceClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-shared";
import { verifyLegacyAdminPassword } from "@/lib/legacy-admin-auth";

type LoginBody = {
  email?: string;
  password?: string;
};

type UserRecord = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

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

async function listAdminUsers(): Promise<UserRecord[]> {
  const serviceClient = createAdminServiceClient();
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

  const serviceClient = createAdminServiceClient();
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
    if (
      isLightPostgresRuntime(process.env, {
        mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
      }) &&
      resolveRuntimeAuthSetupStatus(process.env, {
        mode: ["ADMIN_DATABASE_MODE", "DATABASE_MODE", "NEXT_PUBLIC_RUNTIME_DATABASE_MODE"],
        authStatus: ["AUTH_SETUP_STATUS", "NEXT_PUBLIC_AUTH_SETUP_STATUS"],
      }) === "blocked_auth_setup"
    ) {
      return NextResponse.json(
        {
          code: "blocked_auth_setup",
          error: "Bu store icin admin auth kurulumu henuz tamamlanmadi.",
        },
        { status: 503 },
      );
    }

    const { email, password }: LoginBody = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }

    let repaired = false;
    let publicClient = createAdminLoginClient();
    let { data, error } = await publicClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (readAuthErrorMessage(error).includes("Invalid login credentials")) {
      const legacyVerified = await verifyLegacyAdminPassword(email, password);

      if (legacyVerified) {
        const repairResult = await repairSelfHostedPassword(email, password);
        repaired = repairResult.repaired;

        publicClient = createAdminLoginClient();
        ({ data, error } = await publicClient.auth.signInWithPassword({
          email: email.trim(),
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

    return NextResponse.json(
      {
        session: data.session,
        user: data.user,
        repaired,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giris yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
