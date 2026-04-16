import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createServerClient as createAdminServiceClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseServerUrl } from "@/lib/supabase-shared";
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

async function applyAdminSessionCookies(
  response: NextResponse,
  session: { access_token: string; refresh_token: string },
) {
  const cookieStore = await cookies();
  const authClient = createServerClient(getSupabaseServerUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          try {
            cookieStore.set(cookie.name, cookie.value, cookie.options);
          } catch {
            // Route handlers can fail to mutate the request cookie store in some runtimes.
          }

          response.cookies.set(cookie.name, cookie.value, cookie.options);
        }
      },
    },
  });

  const { error } = await authClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    throw new Error(error.message);
  }
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

    const response = NextResponse.json(
      {
        session: data.session,
        user: data.user,
        repaired,
      },
      { status: 200 },
    );

    await applyAdminSessionCookies(response, {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giris yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
