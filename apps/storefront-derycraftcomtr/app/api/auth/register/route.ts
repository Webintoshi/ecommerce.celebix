import { NextResponse } from "next/server";
import { isLogtoCustomerAuthEnabled } from "@/lib/customer-auth-provider";
import { createServerClient } from "@/lib/supabase";
import {
  DERYCRAFT_AUTH_MIGRATION_CODE,
  DERYCRAFT_AUTH_MIGRATION_MESSAGE,
  isStorefrontCustomerAuthMigrationRequired,
} from "@/lib/supabase-disconnect-readiness";
import { absoluteStorefrontUrl } from "@/lib/storefront-runtime";

type RegisterBody = {
  email?: string;
  password?: string;
  metadata?: Record<string, unknown>;
};

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

  if (isLogtoCustomerAuthEnabled()) {
    return NextResponse.json(
      {
        error: "Musteri kaydi guvenli kayit ekranina tasindi. Lutfen /kayit veya /api/auth/sign-in kullanin.",
        code: "customer_auth_redirect_required",
      },
      { status: 409 },
    );
  }

  try {
    const { email, password, metadata }: RegisterBody = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "E-posta ve sifre zorunludur." }, { status: 400 });
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata ?? {},
    });

    if (error) {
      const normalizedMessage = error.message.toLowerCase();
      if (normalizedMessage.includes("already") || normalizedMessage.includes("registered")) {
        return NextResponse.json({ error: "Bu e-posta adresi zaten kayitli." }, { status: 409 });
      }

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ user: data.user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kayit olusturulamadi.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (isLogtoCustomerAuthEnabled()) {
    const url = new URL(absoluteStorefrontUrl("/api/auth/sign-in"));
    url.searchParams.set("next", "/hesap");
    url.searchParams.set("firstScreen", "register");
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(absoluteStorefrontUrl("/kayit"));
}
