import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { listAdminInboxNotificationsForUser } from "@/lib/admin-notification-center";

export async function GET(request: NextRequest) {
    try {
        const auth = await requireAdminAuth("/admin");
        const searchParams = new URL(request.url).searchParams;
        const limit = Number(searchParams.get("limit") || 25);
        const unreadOnly = searchParams.get("unreadOnly") === "true";
        const inbox = await listAdminInboxNotificationsForUser(auth.profile.id, {
            limit,
            unreadOnly,
        });

        return NextResponse.json({
            success: true,
            ...inbox,
        });
    } catch (error) {
        console.error("Admin inbox fetch error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Bildirim kutusu getirilemedi.",
            },
            { status: 500 },
        );
    }
}
