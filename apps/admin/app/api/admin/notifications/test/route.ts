import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/admin-auth";
import { emitAdminNotificationEvent } from "@/lib/admin-notification-center";

export async function POST() {
    try {
        const auth = await requireAdminAuth("/admin");

        await emitAdminNotificationEvent({
            type: "new_order",
            title: "Test bildirimi",
            body: `${auth.profile.full_name || auth.profile.email} icin test bildirimi hazir.`,
            href: "/admin/ayarlar/bildirimler",
            entityType: "notification_test",
            entityId: auth.profile.id,
            payload: {
                source: "admin_test",
            },
            force: true,
        });

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        console.error("Admin notification test error:", error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Test bildirimi gonderilemedi.",
            },
            { status: 500 },
        );
    }
}
