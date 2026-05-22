import { NextResponse } from "next/server";
import { createClient, type Session } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/permissions";
import { createServerClient as createAdminServiceClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseCookieOptions, getSupabaseServerUrl } from "@/lib/supabase-shared";
import { clearAdminRoleCookie, writeAdminRoleCookie } from "@/lib/admin-role-cookie";
import { chunkSessionCookieValue, encodeSessionCookiePayload } from "@/lib/supabase-session-cookie-utils";
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
  return createClient(getSupabaseServerUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function applyAdminSessionCookies(response: NextResponse, session: Session) {
  const { name: cookieName, ...cookieOptions } = getSupabaseCookieOptions();
  const encodedSession = encodeSessionCookiePayload(JSON.stringify(session));
  const chunks = chunkSessionCookieValue(cookieName, encodedSession);
  const staleChunkCount = Math.max(chunks.length, 8);

  response.cookies.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
  for (let index = 0; index < staleChunkCount; index += 1) {
    response.cookies.set(`${cookieName}.${index}`, "", { ...cookieOptions, maxAge: 0 });
  }

  for (const chunk of chunks) {
    response.cookies.set(chunk.name, chunk.value, cookieOptions);
  }
}

async function readAdminRole(userId: string): Promise<string | null> {
  const serviceClient = createAdminServiceClient();
  const { data, error } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<{ role: string }>();

  if (error || !data?.role) {
    return null;
  }

  return data.role;
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

function isKnownAdminRole(role: string): role is UserRole {
  return ["super_admin", "product_manager", "content_creator", "order_manager"].includes(role);
}

export async function POST(request: Request) {
  try {
    const { email, password }: LoginBody = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }

    let repaired = false;
    let loginClient = createAdminLoginClient();
    let { data, error } = await loginClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    const initialErrorMessage = readAuthErrorMessage(error);

    if (isCredentialFailure(initialErrorMessage)) {
      const legacyVerified = await verifyLegacyAdminPassword(email, password);

      if (legacyVerified) {
        const repairResult = await repairSelfHostedPassword(email, password);
        repaired = repairResult.repaired;

        loginClient = createAdminLoginClient();
        ({ data, error } = await loginClient.auth.signInWithPassword({
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

    const response = NextResponse.json(
      {
        session: data.session,
        user: data.user,
        repaired,
      },
      { status: 200 },
    );

    applyAdminSessionCookies(response, data.session);
    const adminRole = await readAdminRole(data.user.id);
    if (adminRole && isKnownAdminRole(adminRole)) {
      writeAdminRoleCookie(response, {
        userId: data.user.id,
        role: adminRole,
        provider: "supabase",
      });
    } else {
      clearAdminRoleCookie(response);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giris yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
