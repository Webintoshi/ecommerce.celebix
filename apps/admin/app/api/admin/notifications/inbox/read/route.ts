import { NextRequest, NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { markAdminInboxNotificationsRead } from "@/lib/admin-notification-center";

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAdminAuth("/admin");
        const body = (await request.json()) as {
            notificationId?: string;
            all?: boolean;
        };

        await markAdminInboxNotificationsRead(auth.profile.id, {
            notificationId: body.notificationId,
            all: Boolean(body.all),
        });

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        console.error("Admin inbox mark-read error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Bildirim okundu olarak isaretlenemedi.",
            },
            { status: 500 },
        );
    }
}
