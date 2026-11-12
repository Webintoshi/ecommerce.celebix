import { validateSameOriginRequest } from "@celebix/platform-config/src/http-security";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { createSessionServerClient } from "@/lib/supabase-server";

function profileValue(value: unknown) {
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function customerResponse(customer: { id: string }, result: "exists" | "updated" | "created") {
    return NextResponse.json({ customer: { id: customer.id }, [result]: true }, {
        status: result === "created" ? 201 : 200,
        headers: { "Cache-Control": "private, no-store" },
    });
}

function bindingConflict() {
    return NextResponse.json({ error: "Müşteri hesabı eşleştirilemedi." }, { status: 409 });
}

export async function POST(request: NextRequest) {
    if (!validateSameOriginRequest(request).allowed) {
        return NextResponse.json({ error: "İstek kaynağı doğrulanamadı." }, { status: 403 });
    }

    try {
        const supabase = await createSessionServerClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user?.email || !user.email_confirmed_at) {
            return NextResponse.json({ error: "Doğrulanmış oturum gerekiyor." }, { status: 401 });
        }

        const body = await request.json().catch(() => null);
        const profile = {
            first_name: profileValue(body?.first_name ?? user.user_metadata.first_name),
            last_name: profileValue(body?.last_name ?? user.user_metadata.last_name),
            phone: profileValue(body?.phone ?? user.user_metadata.phone),
        };
        const db = createServerClient();
        const findLinked = () => db.from("customers").select("id").eq("user_id", user.id).maybeSingle();
        const linked = await findLinked();
        if (linked.error) throw linked.error;
        if (linked.data) return customerResponse(linked.data, "exists");

        const existing = await db.from("customers")
            .select("id, user_id, first_name, last_name, phone").eq("email", user.email).maybeSingle();
        if (existing.error) throw existing.error;

        if (existing.data) {
            if (existing.data.user_id === user.id) return customerResponse(existing.data, "exists");
            if (existing.data.user_id) return bindingConflict();

            const { data, error } = await db.from("customers").update({
                user_id: user.id,
                first_name: profile.first_name || existing.data.first_name,
                last_name: profile.last_name || existing.data.last_name,
                phone: profile.phone || existing.data.phone,
                updated_at: new Date().toISOString(),
            }).eq("id", existing.data.id).is("user_id", null).select("id").maybeSingle();

            if (error && error.code !== "23505") throw error;
            if (data) return customerResponse(data, "updated");
        } else {
            const { data, error } = await db.from("customers").insert({
                ...profile,
                email: user.email,
                user_id: user.id,
                status: "active",
                total_orders: 0,
                total_spent: 0,
            }).select("id").single();

            if (error && error.code !== "23505") throw error;
            if (data) return customerResponse(data, "created");
        }

        const concurrent = await findLinked();
        if (concurrent.error) throw concurrent.error;
        return concurrent.data ? customerResponse(concurrent.data, "exists") : bindingConflict();
    } catch {
        return NextResponse.json({ error: "Müşteri hesabı eşleştirilemedi." }, { status: 500 });
    }
}
