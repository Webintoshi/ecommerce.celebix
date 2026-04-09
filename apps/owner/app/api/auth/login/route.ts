import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createOwnerServiceClient } from "@/lib/owner-supabase-server";
import { getOwnerSupabaseAnonKey, getOwnerSupabaseUrl } from "@/lib/owner-supabase-shared";
import { verifyLegacyOwnerPassword } from "@/lib/legacy-owner-auth";

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

function normalizeAuthErrorMessage(error: unknown): string {
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

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function listOwnerUsers(): Promise<UserRecord[]> {
  const serviceClient = createOwnerServiceClient();
  const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    throw new Error(error.message);
  }

  return (data.users as UserRecord[]) ?? [];
}

async function repairSelfHostedPassword(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const ownerUsers = await listOwnerUsers();
  const existingUser = ownerUsers.find((entry) => normalizeEmail(entry.email || "") === normalizedEmail);

  if (!existingUser) {
    return { repaired: false, reason: "owner_user_missing" as const };
  }

  const serviceClient = createOwnerServiceClient();
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

function createOwnerRouteClient(
  requestCookies: Awaited<ReturnType<typeof cookies>>,
  cookieMutations: PendingCookie[],
) {
  return createServerClient(getOwnerSupabaseUrl(), getOwnerSupabaseAnonKey(), {
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
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }

    const requestCookies = await cookies();
    const cookieMutations: PendingCookie[] = [];
    let repaired = false;

    let publicClient = createOwnerRouteClient(requestCookies, cookieMutations);
    let { data, error } = await publicClient.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error?.message?.includes("Invalid login credentials")) {
      const legacyVerified = await verifyLegacyOwnerPassword(email, password);

      if (legacyVerified) {
        const repairResult = await repairSelfHostedPassword(email, password);
        repaired = repairResult.repaired;

        publicClient = createOwnerRouteClient(requestCookies, cookieMutations);
        ({ data, error } = await publicClient.auth.signInWithPassword({
          email: email.trim(),
          password,
        }));
      }
    }

    const errorMessage = normalizeAuthErrorMessage(error);

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

    for (const cookie of cookieMutations) {
      response.cookies.set(cookie.name, cookie.value, cookie.options as never);
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giris yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
