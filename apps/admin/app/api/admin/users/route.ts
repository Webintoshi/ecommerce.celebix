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

async function getBootstrapState() {
  const supabaseAdmin = getSupabaseAdmin();
  const {
    data: { users },
    error,
  } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });

  if (error) {
    throw error;
  }

  return {
    isFirstUser: (users?.length ?? 0) === 0,
  };
}

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("bootstrap") === "1") {
      const bootstrapState = await getBootstrapState();
      return NextResponse.json({ success: true, ...bootstrapState });
    }

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
    const bootstrapState = await getBootstrapState();
    const auth = bootstrapState.isFirstUser ? null : await getAdminAuthContext();

    if (!bootstrapState.isFirstUser && (!auth || auth.profile.role !== "super_admin")) {
      return NextResponse.json({ success: false, error: "Sadece super admin yeni yonetici ekleyebilir." }, { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const body = await request.json();
    const { email, password, fullName, role, taskDefinition } = body;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json({ success: false, error: "Tum alanlar zorunludur." }, { status: 400 });
    }

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      throw createError;
    }

    if (!userData.user) {
      throw new Error("Kullanici olusturulamadi.");
    }

    const assignedRole = bootstrapState.isFirstUser ? "super_admin" : role;
    const assignedTask = bootstrapState.isFirstUser ? "Sistem Kurucusu" : taskDefinition;

    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: userData.user.id,
      full_name: fullName,
      role: assignedRole,
      task_definition: assignedTask,
    });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      message: bootstrapState.isFirstUser ? "Ilk yonetici basariyla olusturuldu." : "Yonetici basariyla olusturuldu.",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAdminAuthContext();
    if (!auth || auth.profile.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "Sadece super admin yonetici silebilir." }, { status: 403 });
    }

    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID gerekli." }, { status: 400 });
    }

    if (id === auth.user.id) {
      return NextResponse.json({ success: false, error: "Kendi hesabinizi silemezsiniz." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, message: "Yonetici silindi." });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
