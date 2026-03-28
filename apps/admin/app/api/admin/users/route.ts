import { NextRequest, NextResponse } from "next/server";
import { getAdminAuthContext } from "@/lib/admin-auth";
import { createServerClient } from "@/lib/supabase";

let cachedSupabaseAdmin: ReturnType<typeof createServerClient> | null = null;

function getSupabaseAdmin() {
  if (!cachedSupabaseAdmin) {
    cachedSupabaseAdmin = createServerClient();
  }

  return cachedSupabaseAdmin;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAdminAuthContext();
    if (!auth || auth.profile.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "Bu listeyi gormek icin super admin olman gerekir." }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (profilesError) {
      throw profilesError;
    }

    const {
      data: { users },
      error: usersError,
    } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      throw usersError;
    }

    const admins = (profiles ?? []).map((profile) => {
      const user = users.find((entry) => entry.id === profile.id);
      return {
        ...profile,
        email: user?.email || "Unknown",
      };
    });

    return NextResponse.json({ success: true, admins });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    void request;
    return NextResponse.json(
      {
        success: false,
        error: "Yonetici hesaplari sadece Celebix owner paneli uzerinden olusturulabilir.",
      },
      { status: 403 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    void request;
    return NextResponse.json(
      {
        success: false,
        error: "Yonetici hesaplari sadece Celebix owner paneli uzerinden yonetilebilir.",
      },
      { status: 403 },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
