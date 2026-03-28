import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

let cachedSupabaseAdmin: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
    if (cachedSupabaseAdmin) {
        return cachedSupabaseAdmin;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
    }

    if (!serviceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
    }

    try {
        new URL(supabaseUrl);
    } catch {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is malformed.");
    }

    cachedSupabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    return cachedSupabaseAdmin;
}

export async function GET() {
    try {
        const supabaseAdmin = getSupabaseAdmin();

        const { data: profiles, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .order("created_at", { ascending: false });

        if (profilesError) throw profilesError;

        const {
            data: { users },
            error: usersError,
        } = await supabaseAdmin.auth.admin.listUsers();

        if (usersError) throw usersError;

        const admins = (profiles ?? []).map((profile) => {
            const user = users.find((u) => u.id === profile.id);
            return {
                ...profile,
                email: user?.email || "Unknown",
            };
        });

        return NextResponse.json({ success: true, admins });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const body = await req.json();
        const { email, password, fullName, role, taskDefinition } = body;

        if (!email || !password || !fullName || !role) {
            return NextResponse.json({ success: false, error: "Tüm alanlar zorunludur." }, { status: 400 });
        }

        const {
            data: { users },
            error: listError,
        } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 2 });

        if (listError) throw listError;

        const isFirstUser = users.length === 0;

        if (!isFirstUser) {
            const authHeader = req.headers.get("Authorization");
            if (!authHeader) {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Yetkisiz erişim. Kayıtlı yönetici varsa oturum açmalısınız.",
                    },
                    { status: 401 }
                );
            }

            const token = authHeader.replace("Bearer ", "");
            const {
                data: { user },
                error: authError,
            } = await supabaseAdmin.auth.getUser(token);

            if (authError || !user) {
                return NextResponse.json({ success: false, error: "Geçersiz oturum." }, { status: 401 });
            }

            const { data: requesterProfile } = await supabaseAdmin
                .from("profiles")
                .select("role")
                .eq("id", user.id)
                .single();

            if (requesterProfile?.role !== "super_admin") {
                return NextResponse.json(
                    {
                        success: false,
                        error: "Sadece Süper Yöneticiler yeni yönetici ekleyebilir.",
                    },
                    { status: 403 }
                );
            }
        }

        const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
        });

        if (createError) throw createError;
        if (!userData.user) throw new Error("Kullanıcı oluşturulamadı.");

        const { error: profileError } = await supabaseAdmin.from("profiles").insert({
            id: userData.user.id,
            full_name: fullName,
            role: isFirstUser ? "super_admin" : role,
            task_definition: isFirstUser ? "Sistem Kurucusu" : taskDefinition,
        });

        if (profileError) {
            await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
            throw profileError;
        }

        return NextResponse.json({
            success: true,
            message: isFirstUser ? "İlk yönetici başarıyla oluşturuldu." : "Yönetici başarıyla oluşturuldu.",
        });
    } catch (error: unknown) {
        console.log("Create Admin Error:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json({ success: false, error: "ID gerekli." }, { status: 400 });
        }

        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) throw error;

        return NextResponse.json({ success: true, message: "Yönetici silindi." });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
    }
}
