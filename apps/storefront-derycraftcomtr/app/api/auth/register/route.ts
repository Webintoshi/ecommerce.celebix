import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isDerycraftLightPostgresRuntime } from "@/lib/derycraft-light-postgres";

type RegisterBody = {
  email?: string;
  password?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(request: Request) {
  if (isDerycraftLightPostgresRuntime()) {
    return NextResponse.json(
      {
        error: "Musteri hesabi olusturma gecici olarak devre disi. Siparislerinizi misafir olarak tamamlayabilirsiniz.",
        code: "temporarily_disabled",
      },
      { status: 503 },
    );
  }

  try {
    const { email, password, metadata }: RegisterBody = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
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
