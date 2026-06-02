import { NextResponse } from "next/server";
import { createPublicServerClient, createServerClient } from "@/lib/supabase";
import {
  DERYCRAFT_AUTH_MIGRATION_CODE,
  DERYCRAFT_AUTH_MIGRATION_MESSAGE,
  isStorefrontCustomerAuthMigrationRequired,
} from "@/lib/supabase-disconnect-readiness";

type LoginBody = {
  email?: string;
  password?: string;
};

async function findUserByEmail(email: string) {
  const adminClient = createServerClient();
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) {
    return { user: null, error };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = data.users.find((entry) => entry.email?.trim().toLowerCase() === normalizedEmail) ?? null;

  return { user, error: null };
}

export async function POST(request: Request) {
  if (isStorefrontCustomerAuthMigrationRequired()) {
    return NextResponse.json(
      {
        error: DERYCRAFT_AUTH_MIGRATION_MESSAGE,
        code: DERYCRAFT_AUTH_MIGRATION_CODE,
      },
      { status: 503 },
    );
  }

  try {
    const { email, password }: LoginBody = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }

    const publicClient = createPublicServerClient();
    let { data, error } = await publicClient.auth.signInWithPassword({ email, password });

    if (error?.message?.includes("Email not confirmed")) {
      const { user, error: listError } = await findUserByEmail(email);

      if (listError) {
        return NextResponse.json({ error: listError.message }, { status: 400 });
      }

      if (user) {
        const adminClient = createServerClient();
        const { error: confirmError } = await adminClient.auth.admin.updateUserById(user.id, {
          email_confirm: true,
        });

        if (confirmError) {
          return NextResponse.json({ error: confirmError.message }, { status: 400 });
        }

        ({ data, error } = await publicClient.auth.signInWithPassword({ email, password }));
      }
    }

    if (error || !data.session) {
      return NextResponse.json(
        { error: error?.message || "Giris yapilamadi." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        session: data.session,
        user: data.user,
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Giris yapilamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
