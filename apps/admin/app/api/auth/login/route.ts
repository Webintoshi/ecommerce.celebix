import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createServerClient as createAdminServiceClient } from "@/lib/supabase";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase-shared";
import { verifyLegacyAdminPassword } from "@/lib/legacy-admin-auth";

type LoginBody = {
  email?: string;
  password?: string;
};

type PendingCookie = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

type UserRecord = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
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
    return { repaired: false, reason: "admin_user_missing" as const };
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

function createAdminRouteClient(
  requestCookies: Awaited<ReturnType<typeof cookies>>,
  cookieMutations: PendingCookie[],
) {
  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return requestCookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          const { name, value, ...options } = cookie;
          cookieMutations.push({
            name,
            value,
            options,
          });
        }
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const { email, password }: LoginBody = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve şifre zorunludur." }, { status: 400 });
    }

    const requestCookies = await cookies();
    const cookieMutations: PendingCookie[] = [];
    let repaired = false;

    let publicClient = createAdminRouteClient(requestCookies, cookieMutations);
    let { data, error } = await publicClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error?.message?.includes("Invalid login credentials")) {
      const legacyVerified = await verifyLegacyAdminPassword(email, password);

      if (legacyVerified) {
        const repairResult = await repairSelfHostedPassword(email, password);
        repaired = repairResult.repaired;

        publicClient = createAdminRouteClient(requestCookies, cookieMutations);
        ({ data, error } = await publicClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        }));
      }
    }

    if (error || !data.session) {
      return NextResponse.json(
        { error: error?.message || "Giriş yapılamadı." },
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

    for (const cookie of cookieMutations) {
      response.cookies.set(cookie.name, cookie.value, cookie.options as never);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giriş yapılamadı.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
